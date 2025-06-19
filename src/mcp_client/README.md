## Setting Up Bedrock Claude API
- 1. Create an IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-workloads.html).
- 2. Collect the access keys from the IAM credential (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).
- 3. Configure AWS keys as environment variable (https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html#configuration).

## Environment variable structure
```text
PORT=3000

OPENAI_API_KEY=

BEDROCK_ACESSS_KEY=
BEDROCK_SECRET_KEY=
```

## Loading a server
```bash
npm install
npm run dev ## for hot reloading
```