import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { FileCard } from "@/components/FileCard";
import { PaginationLink } from "@/components/PaginationLink";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function MinePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listFiles(page, limit, user.id);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">your uploads</h1>
      </div>
      <div className={styles.grid}>
        {data.files.map((f) => <FileCard key={f.id} file={f} />)}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <PaginationLink href={`/mine?page=${page - 1}`}>← prev</PaginationLink>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <PaginationLink href={`/mine?page=${page + 1}`}>next →</PaginationLink>}
        </div>
      )}
    </>
  );
}
