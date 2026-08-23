FROM nginx:stable-alpine

# Remove default nginx content and add app
RUN rm -rf /usr/share/nginx/html/*

COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 6969

CMD ["nginx", "-g", "daemon off;"]
