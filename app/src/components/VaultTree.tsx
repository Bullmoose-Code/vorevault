import { pool } from "@/lib/db";
import { VaultTreeView, type FolderNode } from "./VaultTreeView";

async function fetchAllFolders(): Promise<FolderNode[]> {
  const { rows } = await pool.query<FolderNode>(
    `SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL ORDER BY LOWER(name)`,
  );
  return rows;
}

export async function VaultTree() {
  const nodes = await fetchAllFolders();
  return <VaultTreeView nodes={nodes} />;
}
