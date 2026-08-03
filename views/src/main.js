import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import { applyDocumentLocale, locale } from "./i18n.js";
import "./styles/tokens.css";

applyDocumentLocale(locale.value);

createApp(App).use(router).mount("#app");
