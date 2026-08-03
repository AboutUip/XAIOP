import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./pages/HomeView.vue";
import ProtocolView from "./pages/ProtocolView.vue";
import SdkView from "./pages/SdkView.vue";
import PlaygroundView from "./pages/PlaygroundView.vue";
import LiveStreamView from "./pages/LiveStreamView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/protocol", name: "protocol", component: ProtocolView },
    { path: "/sdk", name: "sdk", component: SdkView },
    { path: "/sdk/:stack", name: "sdk-stack", component: SdkView, props: true },
    { path: "/playground", name: "playground", component: PlaygroundView },
    {
      path: "/live",
      name: "live",
      component: LiveStreamView,
      meta: { fullscreen: true },
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});
