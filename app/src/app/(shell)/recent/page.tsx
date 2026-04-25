import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTopLevelItems } from "@/lib/files";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { PaginationLink } from "@/components/PaginationLink";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listTopLevelItems(page, limit, {});
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">recent uploads</h1>
      </div>
      <div className={styles.grid}>
        {data.items.map((it) => it.kind === "folder" ? (
          <FolderTile key={`f-${it.id}`} id={it.id} name={it.name}
            fileCount={it.direct_file_count} subfolderCount={it.direct_subfolder_count}
            createdBy={it.created_by} parentId={null} />
        ) : (
          <FileCard key={`x-${it.id}`} file={it} fromQuery="from=recent" />
        ))}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <PaginationLink href={`/recent?page=${page - 1}`}>← prev</PaginationLink>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <PaginationLink href={`/recent?page=${page + 1}`}>next →</PaginationLink>}
        </div>
      )}
    </>
  );
}
