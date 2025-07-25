import { Router } from "express";
import multer from "multer";
import * as generateRoutes from "./generate";
import * as modifyRoutes from "./modify";
import * as toolRoutes from "./utility";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    fieldSize: 100 * 1024 * 1024, // 100MB limit
  },
});

export const createRoutes = () => {
  const router = Router();

  // Generation routes
  router.post("/generate/text", upload.none(), generateRoutes.generateFromText);
  router.post(
    "/generate/image",
    upload.single("image"),
    generateRoutes.generateFromImage
  );
  router.post(
    "/generate/text-image",
    upload.single("image"),
    generateRoutes.generateFromTextAndImage
  );
  router.post(
    "/modify/text-image",
    upload.single("image"),
    modifyRoutes.modifyFromTextAndImage
  );
  // Tool routes
  router.post("/tool/get_selection", toolRoutes.getSelection);
  router.post(
    "/tool/delete_all_top_level_nodes",
    toolRoutes.deleteAllTopLevelNodes
  );
  router.post("/tool/retrieve_page_status", toolRoutes.retrievePageStatus);
  router.post("/tool/retrieve_page_image", toolRoutes.retrievePageImage);

  router.post("/tool/get_channels", toolRoutes.getChannels);
  router.post("/tool/select_channel", toolRoutes.selectChannel);

  return router;
};
