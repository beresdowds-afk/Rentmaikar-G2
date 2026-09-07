import { AdminDailyTodoList } from '@/components/admin/AdminDailyTodoList';

/**
 * Standalone embed view of the admin daily to-do list, intended to be framed
 * from other dashboards (e.g. <iframe src="/admin/embed/todo-list" />).
 */
const TodoListEmbedPage = () => (
  <main className="min-h-screen bg-background p-2">
    <h1 className="sr-only">Admin daily to-do list</h1>
    <AdminDailyTodoList embedded />
  </main>
);

export default TodoListEmbedPage;
