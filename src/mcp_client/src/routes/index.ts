import { Router } from "express";
import multer from "multer";
import * as replicationRoutes from "./replication";
import * as modificationRoutes from "./modification";
import * as toolRoutes from "./utility";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    fieldSize: 100 * 1024 * 1024,
  },
});

export const createRoutes = () => {
  const router = Router();

  router.post(
    "/replication/text",
    upload.none(),
    replicationRoutes.replicationFromText
  );
  router.post(
    "/replication/image",
    upload.single("image"),
    replicationRoutes.replicationFromImage
  );
  router.post(
    "/replication/text-image",
    upload.single("image"),
    replicationRoutes.replicationFromTextAndImage
  );
  router.post(
    "/modification/text-image",
    upload.single("image"),
    modificationRoutes.modificationFromTextAndImage
  );
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
