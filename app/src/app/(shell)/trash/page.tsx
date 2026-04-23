import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTrashedItems } from "@/lib/folders";
import { TrashRow } from "@/components/TrashRow";
import { EmptyTrashButton } from "@/components/EmptyTrashButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const data = await listTrashedItems({ page, limit });
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">trash</h1>
        <div className="vv-meta">
          <strong>{data.total}</strong> {data.total === 1 ? "item" : "items"} · auto-purged after 30 days
        </div>
      </div>

      {user.is_admin && data.total > 0 && (
        <div className={styles.adminBar}>
          <EmptyTrashButton />
        </div>
      )}

      {data.items.length === 0 ? (
        <p className={styles.empty}>trash is empty.</p>
      ) : (
        <div className={styles.list}>
          {data.items.map((item) => (
            <TrashRow
              key={`${item.kind}:${item.id}`}
              item={item}
              currentUserIsAdmin={user.is_admin}
              currentUserId={user.id}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <a href={`/trash?page=${page - 1}`}>← prev</a>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <a href={`/trash?page=${page + 1}`}>next →</a>}
        </div>
      )}
    </>
  );
}
