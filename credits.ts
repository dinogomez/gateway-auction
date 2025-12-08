export {};

const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

if (!apiKey) {
  console.error("Missing API key. Set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN");
  process.exit(1);
}

const response = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

if (!response.ok) {
  console.error(`Error: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const credits = await response.json();
console.log(credits);
