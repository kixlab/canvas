## Setting Up Bedrock (Amazon) Claude

- 1. Create an IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-workloads.html).
- 2. Collect the access keys from the IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).
- 3. Configure AWS keys as environment variable (https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html#configuration).

## Setting Up Ollama Server

- 1. Setup a local Ollama server in the environment.
- 2. Configure a localhost address and the port for the Ollama.
- 3. Serve the Ollama server and define `OLLAMA_BASE_URL` in `src/mcp_client/src/.env` (required when using the Ollama provider).

## Environment variable structure

```text
PORT=3000

OPENAI_API_KEY=
GEMINI_API_KEY=

BEDROCK_ACCESS_KEY=
BEDROCK_SECRET_KEY=

OLLAMA_BASE_URL=
```

## Loading a server

```bash
npm install
npm run dev ## for hot reloading
```

## Setting a custom port

```bash
npm run start -- --port=3001
```

## Debug UI

- Open `http://localhost:<PORT>` after running the server.
- Use **Replication** for image-only replication.
- Use **Modification** for image + instruction updates (requires `baseJsonString`).
- The tool panel supports channel selection and basic canvas utility calls.
- You can test individual examples with this client as well.

## Code structure

```
src/
├── app.ts              # Express server setup and initialization
├── types.ts            # TypeScript type definitions
├── agents/             # AI agent implementations
│   ├── agentInstance.ts          # Base agent class
│   ├── index.ts                  # Agent exports
│   ├── reactReplicationAgent.ts  # ReAct replication agent
│   ├── reactModificationAgent.ts # ReAct modification agent
│   ├── singleReplicationAgent.ts # Single-turn replication agent
│   ├── singleModificationAgent.ts # Single-turn modification agent
│   ├── codeReplicationAgent.ts   # Code replication agent
├── core/               # Core functionality
│   ├── session.ts      # Session management
│   └── tools.ts        # Tool integration and execution
├── models/             # LLM model implementations
│   ├── bedrockModel.ts # Bedrock/Claude integration
│   ├── modelInstance.ts # Base model interface
│   ├── index.ts        # Model exports
│   ├── openaiModel.ts  # OpenAI integration
│   ├── googleModel.ts  # Gemini integration
│   └── ollamaModel.ts  # Ollama integration
├── routes/             # Express route handlers
│   ├── replication.ts     # Replication endpoint
│   ├── modification.ts    # Modification endpoint
│   ├── index.ts           # Route configuration
│   └── utility.ts      # Utility endpoints
└── utils/              # Helper utilities
    ├── helpers.ts      # General helper functions
    └── prompts.ts      # Prompt templates
```

## API Endpoints

### Replication Route

- **POST** `/replication`
  - Body: `image` (file), `metadata` (JSON string)
  - Content-Type: `multipart/form-data`
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string",
      "payload": {
        "history": "array",
        "responses": "array",
        "cost": "number",
        "json_structure": "object",
        "image_uri": "string",
        "case_id": "string"
      }
    }
    ```

### Modification Route

- **POST** `/modification`
  - Body: `message` (string), `image` (file), `baseJsonString` (string, required), `metadata` (JSON string)
  - Content-Type: `multipart/form-data`
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string",
      "payload": {
        "history": "array",
        "responses": "array",
        "cost": "number",
        "json_structure": "object",
        "image_uri": "string",
        "case_id": "string"
      }
    }
    ```

#### Metadata Format

```json
{
  "case_id": "string",
  "model_provider": "openai | google | amazon | ollama",
  "model_name": "string",
  "agent_type": "react_replication | react_modification | code_replication | single_replication | single_modification",
  "temperature": "number",
  "input_cost": "number",
  "output_cost": "number",
  "max_tokens": "number",
  "max_turns": "number",
  "max_retries": "number (optional)"
}
```

### Utility Routes

- **POST** `/tool/get_selection`
  - Body: None
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string (optional)",
      "payload": {
        "selection": "array"
      }
    }
    ```

- **POST** `/tool/delete_all_top_level_nodes`
  - Body: None
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string",
      "payload": {
        "deleted_node_ids": "array"
      }
    }
    ```

- **POST** `/tool/retrieve_page_status`
  - Body: None
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string (optional)",
      "payload": {
        "is_empty": "boolean"
      }
    }
    ```

- **POST** `/tool/retrieve_page_image`
  - Body: None
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string (optional)",
      "payload": {
        "image_uri": "string"
      }
    }
    ```

- **POST** `/tool/get_channels`
  - Body: None
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string (optional)",
      "payload": {
        "available_channels": "array<string>",
        "current_channel": "string | null"
      }
    }
    ```

- **POST** `/tool/select_channel`
  - Body: `channel` (string) or Query: `?channel=string`
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string"
    }
    ```

## Expanding Model Types

1. Add a model class under `src/mcp_client/src/models` that implements `ModelInstance`.
2. Register the provider and model in `src/mcp_client/src/models/index.ts`.
3. Add the provider enum value in `src/mcp_client/src/types.ts`.
4. Add presets in the debug UI (`src/mcp_client/src/public/templates/index.html`) and experiments config if needed.

## Python Request Examples

```python
# Example 1: Image replication
def generate_image_example():
    url = f"{BASE_URL}/replication"

    metadata = {
        "case_id": "test_case_002",
        "model_provider": "openai",
        "model_name": "gpt-4o-2024-08-06",
        "agent_type": "react_replication",
        "temperature": 0.0,
        "input_cost": 0.0025,
        "output_cost": 0.0125,
        "max_tokens": 4096,
        "max_turns": 100
    }

    files = {
        "image": open("screenshot.png", "rb")
    }

    data = {
        "metadata": json.dumps(metadata)
    }

    response = requests.post(url, files=files, data=data)
    return response.json()

# Example 2: Image modification
def modify_image_example():
    url = f"{BASE_URL}/modification"

    metadata = {
        "case_id": "test_case_003",
        "model_provider": "amazon",
        "model_name": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "agent_type": "react_modification",
        "temperature": 0.0,
        "input_cost": 0.003,
        "output_cost": 0.015,
        "max_tokens": 8192,
        "max_turns": 100
    }

    files = {
        "image": open("ui_mockup.png", "rb")
    }

    data = {
        "message": "Change the primary button to green and update the title text.",
        "baseJsonString": "{\"document\": {\"id\": \"...\"}}",
        "metadata": json.dumps(metadata)
    }

    response = requests.post(url, files=files, data=data)
    return response.json()

```
