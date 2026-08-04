const ecs = require("@8thwall/ecs");

const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [require("../image-targets/trigger-label.json")],
  });
  XR8.addCameraPipelineModule(LandingPage.pipelineModule());
};

window.XR8 ? onxrloaded() : window.addEventListener("xrloaded", onxrloaded);
