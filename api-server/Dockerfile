FROM node:20-slim

# ffmpeg isn't an npm package — it's a real binary. This is the line that
# Cloudflare Workers could never give you, and why this lives on its own host.
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

EXPOSE 8787
CMD ["node", "server.js"]
