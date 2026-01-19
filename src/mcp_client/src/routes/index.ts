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

  // Image-only replication endpoint.
  router.post(
    "/replication",
    upload.single("image"),
    replicationRoutes.runReplication
  );
  // Modification endpoint requires image + instruction + base JSON.
  router.post(
    "/modification",
    upload.single("image"),
    modificationRoutes.runModification
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
