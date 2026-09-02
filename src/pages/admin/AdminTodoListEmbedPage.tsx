import { AdminDailyTodoList } from '@/components/admin/AdminDailyTodoList';

export const AdminTodoListEmbedPage = () => {
  return (
    <div className="min-h-screen w-full bg-background p-3 flex flex-col justify-start">
      <AdminDailyTodoList isEmbedPage={true} />
    </div>
  );
};

export default AdminTodoListEmbedPage;
