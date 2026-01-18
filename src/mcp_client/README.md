## Setting Up Bedrock Claude API

- 1. Create an IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-workloads.html).
- 2. Collect the access keys from the IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).
- 3. Configure AWS keys as environment variable (https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html#configuration).

## Setting Up Ollama Server

- 1. Setup a local Ollama server in the environment.
- 2. Configure a localhost address and the port for the Ollama.
- 3. Serve the Ollama server and define the Ollama address as an environment variable in the `.env` inside `src/mcp_client/src/.env`.

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

## Code structure

```
src/
├── app.ts              # Express server setup and initialization
├── types.ts            # TypeScript type definitions
├── agents/             # AI agent implementations
│   ├── agentInstance.ts # Abstract base agent class
│   ├── index.ts        # Agent exports
│   ├── reactReplicationAgent.ts # ReAct replication agent
├── core/               # Core functionality
│   ├── session.ts      # Session management
│   └── tools.ts        # Tool integration and execution
├── models/             # LLM model implementations
│   ├── bedrockModel.ts # Bedrock/Claude integration
│   ├── modelInstance.ts # Abstract model interface
│   ├── index.ts        # Model exports
│   └── openaiModel.ts  # OpenAI integration
├── routes/             # Express route handlers
│   ├── replication.ts     # Content generation endpoints
│   ├── index.ts        # Route configuration
│   ├── modification.ts       # Content modification endpoints
│   └── utility.ts      # Utility endpoints
└── utils/              # Helper utilities
    ├── helpers.ts      # General helper functions
    └── prompts.ts      # Prompt templates
```

## API Endpoint

### Generation Routes

- **POST** `/replication/text`
  - Body: `message` (string), `metadata` (JSON string)
  - Content-Type: `application/x-www-form-urlencoded`
  - **Response**:
    ```json
    {
      "status": "success" | "error",
      "message": "string",
      "payload": {
        "history": "array",
        "responses": "array",
        "json_structure": "object",
        "image_uri": "string",
        "case_id": "string",
        "cost": "number"
      }
    }
    ```

- **POST** `/replication/image`
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

- **POST** `/replication/text-image`
  - Body: `message` (string), `image` (file), `metadata` (JSON string)
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
  "model_provider": "string",
  "model_name": "string",
  "agent_type": "string",
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

## Python Request Example

```python
# Example 1: Text generation
def generate_text_example():
    url = f"{BASE_URL}/replication/text"

    metadata = {
        "case_id": "test_case_001",
        "model_provider": "amazon",
        "model_name": "claude-3-sonnet",
        "agent_type": "react",
        "temperature": 0.7,
        "input_cost": 0.003,
        "output_cost": 0.015,
        "max_tokens": 1000,
        "max_turns": 5,
        "max_retries": 3
    }

    data = {
        "message": "Create a simple button component",
        "metadata": json.dumps(metadata)
    }

    response = requests.post(url, data=data)
    return response.json()

# Example 2: Image generation
def generate_image_example():
    url = f"{BASE_URL}/replication/image"

    metadata = {
        "case_id": "test_case_002",
        "model_provider": "amazon",
        "model_name": "claude-3-sonnet",
        "agent_type": "visual",
        "temperature": 0.5,
        "input_cost": 0.003,
        "output_cost": 0.015,
        "max_tokens": 1500,
        "max_turns": 3
    }

    files = {
        "image": open("screenshot.png", "rb")
    }

    data = {
        "metadata": json.dumps(metadata)
    }

    response = requests.post(url, files=files, data=data)
    return response.json()

# Example 3: Text + Image generation
def generate_text_image_example():
    url = f"{BASE_URL}/replication/text-image"

    metadata = {
        "case_id": "test_case_003",
        "model_provider": "openai",
        "model_name": "gpt-4-vision-preview",
        "agent_type": "visual",
        "temperature": 0.8,
        "input_cost": 0.01,
        "output_cost": 0.03,
        "max_tokens": 2000,
        "max_turns": 4
    }

    files = {
        "image": open("ui_mockup.png", "rb")
    }

    data = {
        "message": "Analyze this UI and suggest improvements",
        "metadata": json.dumps(metadata)
    }

    response = requests.post(url, files=files, data=data)
    return response.json()

```
