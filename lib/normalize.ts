const aliases: Record<string, string> = {
  reactjs: "react", "react.js": "react", "react js": "react", react: "react",
  node: "nodejs", "node.js": "nodejs", nodejs: "nodejs",
  mongo: "mongodb", mongodb: "mongodb", "restful api": "rest_api", "rest api": "rest_api",
  typescript: "typescript", javascript: "javascript", css: "css", html: "html", nextjs: "nextjs", "next.js": "nextjs",
};

export function normalizeLabel(value: string) {
  const clean = value.trim().toLowerCase();
  return aliases[clean] ?? clean.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

