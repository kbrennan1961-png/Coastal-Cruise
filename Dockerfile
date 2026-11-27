FROM debian:bookworm-slim AS source

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

ARG REPO_URL=https://github.com/kbrennan1961-png/Coastal-Cruise.git
WORKDIR /src
RUN git clone --depth 1 "$REPO_URL" . \
    && git lfs pull \
    && rm -rf /src/.git

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=source /src/ /usr/share/nginx/html/

RUN mkdir -p /tmp/nginx/client_body \
             /tmp/nginx/proxy \
             /tmp/nginx/fastcgi \
             /tmp/nginx/uwsgi \
             /tmp/nginx/scgi \
             /var/cache/nginx \
    && chown -R nginx:nginx /tmp/nginx /var/cache/nginx

USER nginx
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
