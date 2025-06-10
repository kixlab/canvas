# src/fastapi_server/agent_multi.py
import os, json, hashlib
from dotenv import load_dotenv
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_core.tools import BaseTool
from langgraph.prebuilt import create_react_agent

from .model_factory import get_model

load_dotenv()

# ---------- MCP 세션 공통 ----------
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir  = str(Path(current_dir).parent)
server_params = StdioServerParameters(
    command="node",
    args=[f"{parent_dir}/mcp_server/dist/server.js"],
)

# ---------- 글로벌 상태 ----------
session, stdio_ctx = None, None
tool_dict = {}
sup_agent = None
worker_agent = None

# ---------- 유틸 ----------
def json_hash(obj) -> str:
    dumped = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(dumped.encode()).hexdigest()

# ---------- 에이전트 생성 ----------
def build_supervisor():
    model = ChatOpenAI(model="gpt-4o", temperature=0.3, max_tokens=512)
    system_prompt = SystemMessage(content=(
        "You are the supervisor. After reading the latest canvas JSON "
        "and whether any change happened, decide the next single MCP tool call.\n"
        "Reply STRICTLY as JSON like {\"tool_name\": ..., \"args\": {...}}.\n"
        "If two consecutive rounds have no change, or after 10 rounds, reply TERMINATE."
    ))
    return create_react_agent(model, tools=[], initial_messages=[system_prompt])

def build_worker(worker_name: str, tools):
    model = get_model(worker_name)
    system_prompt = SystemMessage(content=(
        "You are the worker agent. Execute EXACTLY the tool instruction provided "
        "by the supervisor, with no extra reasoning visible to the user."
    ))
    return create_react_agent(model, tools, initial_messages=[system_prompt])

# ---------- 라이프사이클 ----------
async def startup(worker_name: str):
    global session, stdio_ctx, tool_dict, sup_agent, worker_agent

    stdio_ctx = stdio_client(server_params)
    r, w = await stdio_ctx.__aenter__()
    session = await ClientSession(r, w).__aenter__()
    await session.initialize()

    tools = await load_mcp_tools(session)
    tool_dict = {t.name: t for t in tools if isinstance(t, BaseTool)}

    sup_agent = build_supervisor()
    worker_agent = build_worker(worker_name, tools)

async def shutdown():
    global session, stdio_ctx
    if session:
        await session.__aexit__(None, None, None)
    if stdio_ctx:
        await stdio_ctx.__aexit__(None, None, None)

# ---------- 실행 루프 ----------
async def run_multi_agent(agent_input: list, worker_name: str, max_rounds: int = 10):
    state = {
        "messages": agent_input.copy(),  # 초기 입력 메시지 리스트
        "prev_hash": None,
        "stable_cnt": 0,
    }

    for turn in range(max_rounds):
        sup_out = await sup_agent.ainvoke(state)
        sup_txt = sup_out.content.strip()
        state["messages"].append(sup_out)

        if sup_txt == "TERMINATE":
            break

        try:
            task = json.loads(sup_txt)
            tool_name = task["tool_name"]
            tool_args = task.get("args", {})
        except Exception:
            raise RuntimeError(f"[Supervisor Error] Invalid JSON: {sup_txt}")

        # Worker
        state["messages"].append(
            AIMessage(content=f"Execute {{\"tool_name\": \"{tool_name}\", \"args\": {tool_args}}}")
        )

        try:
            if tool_name not in tool_dict:
                raise KeyError(f"Tool '{tool_name}' not found.")
            res = await tool_dict[tool_name].ainvoke(tool_args)
            state["messages"].append(AIMessage(content=json.dumps(res)))
        except Exception as e:
            state["messages"].append(AIMessage(content=f"[WORKER ERROR] {str(e)}"))

        # Hash check
        canvas_info = await tool_dict["get_document_info"].ainvoke({})
        canvas_json = json.loads(canvas_info)
        new_hash = json_hash(canvas_json)
        changed = new_hash != state["prev_hash"]

        state["prev_hash"] = new_hash
        state["stable_cnt"] = 0 if changed else state["stable_cnt"] + 1
        state["node_diff"] = changed

        if state["stable_cnt"] >= 2:
            state["messages"].append(AIMessage(content="TERMINATE"))
            break

    state["step_count"] = len(state["messages"]) - 1
    return state
