FROM node:22-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# Baked in as a placeholder, not a real default — see docker-entrypoint.sh
# for why a real value here wouldn't survive past this build step anyway.
ENV NEXT_PUBLIC_API_URL=__RUNTIME_NEXT_PUBLIC_API_URL__
RUN npm run build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
