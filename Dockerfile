FROM node:18-bullseye-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Create output directory
RUN mkdir -p media_output

EXPOSE 3000

CMD ["node", "src/index.js"]