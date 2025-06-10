from fastapi import FastAPI, Request, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# ------------------ CLI args ------------------
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--agent_type", choices=["single", "multi"], default="single")
args, _ = parser.parse_known_args()
AGENT_TYPE = args.agent_type

# ------------------ Agent setup ------------------
if AGENT_TYPE == "single":
    from fastapi_server.agent_single import startup, shutdown, run_single_agent as run_agent, call_tool
if AGENT_TYPE == "multi":
    from fastapi_server.agent_multi import startup, shutdown, run_multi_agent as run_agent, call_tool

from fastapi_server.utils import jsonify_agent_response
from fastapi_server.prompts import (
    get_text_based_generation_prompt,
    get_image_based_generation_prompt,
    get_text_image_based_generation_prompt,
    get_modification_without_oracle_prompt,
    get_modification_with_oracle_hierarchy_prompt,
    get_modification_with_oracle_perfect_canvas_prompt,
)

# ------------------ Setup ------------------
import base64
from pydantic import BaseModel
import uvicorn
import os
import re
import json
from typing import Optional, List
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan_context(app: FastAPI):
    await startup(agent_type=AGENT_TYPE)
    yield
    await shutdown()

current_channel: Optional[str] = None

static_dir = os.path.join(os.path.dirname(__file__), "static")
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
os.makedirs(static_dir, exist_ok=True)
os.makedirs(templates_dir, exist_ok=True)

app = FastAPI(lifespan=lifespan_context)
app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# ------------------ Routes ------------------
@app.get("/", response_class=HTMLResponse)
async def get_homepage(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
 
@app.post("/generate/text")
async def generate_with_text(
    message: str = Form(...),
    metadata: str = Form(None)
):
    try:        
        if message:
            instruction = get_text_based_generation_prompt(message)
            agent_input = [{"type": "text", "text": instruction}]
            
            response = await run_agent(
                agent_input,
                metadata={
                    "input_id": metadata or "unknown"
                }
            )
            messages = response.get("messages", [])
            step_count = response.get("step_count", len(messages) - 1)
            json_response = jsonify_agent_response(response)
            return {"response": str(response), "json_response": json_response, "step_count": step_count}
        else:
            raise ValueError("No instruction provided.")
    except Exception as e:
        return {"response": f"Error: {str(e)}"}
    
@app.post("/generate/image")
async def generate_with_image(
    image: UploadFile = File(None), 
    metadata: str = Form(None)
):
    try:
        agent_input = []
        
        base64_image = None
        if image:
            image_bytes = await image.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            instruction = get_image_based_generation_prompt()
            agent_input.append({"type": "text", "text": instruction})
        else:
            raise ValueError("No image provided.")
        if base64_image:
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}",
                    "detail": "auto"
                }
            })
        response = await run_agent(
            agent_input,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        messages = response.get("messages", [])
        step_count = response.get("step_count", len(messages) - 1)

        json_response = jsonify_agent_response(response)
        return {"response": str(response), "json_response": json_response, "step_count": step_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    
@app.post("/generate/text-image")
async def generate_with_text_image(
    image: UploadFile = File(None), 
    message: str = Form(...),
    metadata: str = Form(None)
):
    try:
        agent_input = []
        
        base64_image = None
        if image:
            image_bytes = await image.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
        else:
            raise ValueError("No image provided.")
            
        if message:
            instruction = get_text_image_based_generation_prompt(message)
            agent_input.append({"type": "text", "text": instruction})
        else:
            raise ValueError("No instruction provided.")
            
        if base64_image:
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}",
                    "detail": "auto"
                }
            })

        response = await run_agent(
            agent_input,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        messages = response.get("messages", [])
        step_count = response.get("step_count", len(messages) - 1)

        json_response = jsonify_agent_response(response)
        return {"response": str(response), "json_response": json_response, "step_count": step_count}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/modify/without-oracle")
async def modify_without_oracle(
    image: UploadFile = File(None), 
    message: str = Form(...),
    metadata: str = Form(None)
):
    try:
        agent_input = []
        
        base64_image = None
        if image:
            image_bytes = await image.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
        else:
            raise ValueError("No image provided.")
            
        if message:
            instruction = get_modification_without_oracle_prompt(message)
            agent_input.append({"type": "text", "text": instruction})
        else:
            raise ValueError("No instruction provided.")
            
        if base64_image:
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}",
                    "detail": "auto"
                }
            })

        response = await run_agent(
            agent_input,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        messages = response.get("messages", [])
        step_count = response.get("step_count", len(messages) - 1)

        json_response = jsonify_agent_response(response)
        return {"response": str(response), "json_response": json_response, "step_count": step_count}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/modify/with-oracle/perfect-hierachy")
async def modify_with_oracle_perfect_hierarchy(
    image: UploadFile = File(None), 
    message: str = Form(...),
    metadata: str = Form(None)
):
    try:
        agent_input = []
        
        base64_image = None
        if image:
            image_bytes = await image.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
        else:
            raise ValueError("No image provided.")
            
        if message:
            instruction = get_modification_with_oracle_hierarchy_prompt(message)
            agent_input.append({"type": "text", "text": instruction})
        else:
            raise ValueError("No instruction provided.")
            
        if base64_image:
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}",
                    "detail": "auto"
                }
            })

        response = await run_agent(
            agent_input,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        messages = response.get("messages", [])
        step_count = response.get("step_count", len(messages) - 1)

        json_response = jsonify_agent_response(response)
        return {"response": str(response), "json_response": json_response, "step_count": step_count}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/modify/with-oracle/perfect-canvas")
async def modify_with_oracle_perfect_canvas(
    image: UploadFile = File(None), 
    message: str = Form(...),
    metadata: str = Form(None)
):
    try:
        agent_input = []
        
        base64_image = None
        if image:
            image_bytes = await image.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
        else:
            raise ValueError("No image provided.")
            
        if message:
            instruction = get_modification_with_oracle_perfect_canvas_prompt(message)
            agent_input.append({"type": "text", "text": instruction})
        else:
            raise ValueError("No instruction provided.")
            
        if base64_image:
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}",
                    "detail": "auto"
                }
            })

        response = await run_agent(
            agent_input,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        messages = response.get("messages", [])
        step_count = response.get("step_count", len(messages) - 1)

        json_response = jsonify_agent_response(response)
        return {"response": str(response), "json_response": json_response, "step_count": step_count}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate/image/multi")
async def generate_multi(
    image: UploadFile = File(None),
    message: str = Form("Replicate this UI."),
    worker_model: str = Query(..., description="e.g., claude-3-5-sonnet"),
    metadata: str = Form(None)
):
    try:
        from fastapi_server.agent_multi import startup as startup_multi, shutdown as shutdown_multi, run_multi_agent

        agent_input = []

        if message:
            from fastapi_server.prompts import get_image_based_generation_prompt
            instruction = get_image_based_generation_prompt()
            agent_input.append({"type": "text", "text": instruction})

        if image:
            image_bytes = await image.read()
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            agent_input.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{image_b64}",
                    "detail": "auto"
                }
            })
        else:
            raise ValueError("No image provided.")

        await startup_multi(worker_model)
        state = await run_agent(
            agent_input,
            worker_model,
            metadata={
                "input_id": metadata or "unknown"
            }
        )
        await shutdown_multi()

        return {
            "response": str(state),
            "json_response": state,
            "step_count": state.get("step_count", -1)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/tool/get_selection")
async def get_selection():
    result = await call_tool("get_selection")
    return result

@app.post("/tool/create_root_frame")
async def create_root_frame_endpoint(
    x: int = Query(0),
    y: int = Query(0),
    width: int = Query(...),
    height: int = Query(...),
    name: str = Query("Frame")
):
    result = await call_tool("create_frame", {
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "name": name,
        "fillColor": {"r": 1, "g": 1, "b": 1, "a": 1}
    })
    global root_frame_width, root_frame_height, root_frame_id
    root_frame_width = width
    root_frame_height = height
    
    if isinstance(result, dict) and "message" in result:
        id_match = re.search(r'ID: ([^\.]+)', result["message"])
        if id_match:
            root_frame_id = id_match.group(1)
            print(f"Set root_frame_id to {root_frame_id} and set width, height to {root_frame_width}, {root_frame_height}")
        else:
            root_frame_id = None
    return {"response": result, "root_frame_id": root_frame_id}

@app.post("/tool/create_text_in_root_frame")
async def create_text_in_root_frame():
    global root_frame_id
    if not root_frame_id:
        return {"status": "error", "message": "No root_frame_id set. Please call /tool/create_frame first."}

    result = await call_tool("create_text", {
        "parentId": root_frame_id,
        "x": 100,
        "y": 100,
        "text": "Hello in root!"
    })
    return result

@app.post("/tool/delete_node")
async def delete_node(node_id: str = Query(..., description="ID of the node to delete")):
    result = await call_tool("delete_node", {"nodeId": node_id})
    return result

@app.post("/tool/delete_multiple_nodes")
async def delete_multiple_nodes(node_ids: List[str] = Query(..., description="List of node IDs to delete")):
    result = await call_tool("delete_multiple_nodes", {"nodeIds": node_ids})
    return result

@app.post("/tool/delete_all_top_level_nodes")
async def delete_all_top_level_nodes():
    try:
        response = await call_tool("get_document_info")
        document_info = json.loads(response["message"])

        if "children" not in document_info:
            return {"status": "error", "message": "No children in document."}

        top_node_ids = [node["id"] for node in document_info["children"]]

        if not top_node_ids:
            return {"status": "success", "message": "No nodes to delete."}

        result = await call_tool("delete_multiple_nodes", {"nodeIds": top_node_ids})
        return {"status": "success", "deleted_node_ids": top_node_ids, "result": result}
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
    
@app.post("/tool/get_channels")
async def get_channels_endpoint():
    try:
        result = await call_tool("get_channels")
        
        # Process the result to make it more user-friendly
        if isinstance(result, dict) and "message" in result and result["message"]:
            try:
                # Parse the JSON string in the result message
                channel_data = json.loads(result["message"])
                
                # Extract available channels and current channel
                return {
                    "status": "success",
                    "available_channels": channel_data.get("availableChannels", []),
                    "current_channel": channel_data.get("currentChannel")
                }
            except json.JSONDecodeError:
                return {
                    "status": "error",
                    "message": "Failed to parse channel information"
                }
        
        return {"status": "error", "message": "Invalid response from tool"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
    
@app.post("/tool/select_channel")
async def select_channel_endpoint(
    channel: str = Query(..., description="The channel name to join")
):
    global current_channel
    try:
        result = await call_tool("select_channel", {"channel": channel})
        
        # Process the result to make it more user-friendly
        if isinstance(result, dict) and "message" in result and result["message"]:
            message = result["message"]
            
            # If response indicates successful channel join
            if "Successfully joined channel:" in message:
                # Update server state to track current channel
                current_channel = channel
                return {
                    "status": "success",
                    "channel": current_channel
                }
            # For errors or other responses
            else:
                return {
                    "status": "error" if "Error" in message or "Failed" in message else "success",
                    "message": message
                }
        
        return {"status": "error", "message": "Invalid response from tool"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run("fastapi_server.app:app", host="0.0.0.0", port=8000, reload=True)