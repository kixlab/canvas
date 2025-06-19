import { Router } from "express";
import multer from "multer";
import * as generateRoutes from "./generate";
import * as modifyRoutes from "./modify";
import * as toolRoutes from "./utility";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

export const createRoutes = () => {
  const router = Router();

  // Generation routes
  router.post("/generate/text", generateRoutes.generateFromText);
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

  // Modification routes
  router.post(
    "/modify/without-oracle",
    upload.single("image"),
    modifyRoutes.modifyWithoutOracle
  );
  router.post(
    "/modify/with-oracle/perfect-hierachy",
    upload.single("image"),
    modifyRoutes.modifyWithOracleHierarchy
  );
  router.post(
    "/modify/with-oracle/perfect-canvas",
    upload.single("image"),
    modifyRoutes.modifyWithOraclePerfectCanvas
  );

  // Tool routes
  router.post("/tool/get_selection", toolRoutes.getSelection);
  router.post("/tool/create_root_frame", toolRoutes.createRootFrame);
  router.post(
    "/tool/create_text_in_root_frame",
    toolRoutes.createTextInRootFrame
  );
  router.post("/tool/delete_node", toolRoutes.deleteNode);
  router.post("/tool/delete_multiple_nodes", toolRoutes.deleteMultipleNodes);
  router.post(
    "/tool/delete_all_top_level_nodes",
    toolRoutes.deleteAllTopLevelNodes
  );
  router.post("/tool/get_channels", toolRoutes.getChannels);
  router.post("/tool/select_channel", toolRoutes.selectChannel);

  return router;
};
