import { STRINGS } from "./strings";

const app = document.getElementById("app");
if (app) {
  const heading = document.createElement("h1");
  heading.textContent = STRINGS.title;
  const tagline = document.createElement("p");
  tagline.textContent = STRINGS.tagline;
  app.append(heading, tagline);
}
