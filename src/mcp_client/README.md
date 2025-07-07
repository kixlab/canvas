## Setting Up Bedrock Claude API
- 1. Create an IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-workloads.html).
- 2. Collect the access keys from the IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).
- 3. Configure AWS keys as environment variable (https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html#configuration).

## Environment variable structure
```text
PORT=3000

OPENAI_API_KEY=
GEMINI_API_KEY=

BEDROCK_ACESSS_KEY=
BEDROCK_SECRET_KEY=
```

## Loading a server
```bash
npm install
npm run dev ## for hot reloading
```

## Code structure

```
src/
├── app.ts              # Express server setup and initialization
├── types.ts            # TypeScript type definitions
├── agents/             # AI agent implementations
│   ├── baseAgent.ts    # Abstract base agent class
│   ├── index.ts        # Agent exports
│   ├── reactAgent.ts   # ReAct pattern agent
│   └── visualAgent.ts  # ReAct + visual feedback agent
├── core/               # Core functionality
│   ├── session.ts      # Session management
│   └── tools.ts        # Tool integration and execution
├── models/             # LLM model implementations
│   ├── anthropicModel.ts # Bedrock/Claude integration
│   ├── baseModel.ts    # Abstract model interface
│   ├── index.ts        # Model exports
│   └── openaiModel.ts  # OpenAI integration
├── routes/             # Express route handlers
│   ├── generate.ts     # Content generation endpoints
│   ├── index.ts        # Route configuration
│   ├── modify.ts       # Content modification endpoints
│   └── utility.ts      # Utility endpoints
└── utils/              # Helper utilities
    ├── helpers.ts      # General helper functions
    └── prompts.ts      # Prompt templates
```