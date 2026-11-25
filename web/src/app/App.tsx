import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { TaskCreatePage } from '../features/tasks/pages/TaskCreatePage';
import { TaskDetailPage } from '../features/tasks/pages/TaskDetailPage';
import { TaskEditPage } from '../features/tasks/pages/TaskEditPage';
import { TasksPage } from '../features/tasks/pages/TasksPage';
import { AdminShell } from '../shared/layout/AdminShell';
import { ToastProvider } from '../shared/ui/Toast';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminShell />}>
              <Route path="/tasks" element={<TasksPage />} />
              {/* /tasks/new 与 /tasks/:taskId 不冲突：react-router 按「静态段优先」打分匹配，
                  这里把静态段写在前面只是读起来顺，不是匹配的前提 */}
              <Route path="/tasks/new" element={<TaskCreatePage />} />
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="/tasks/:taskId/edit" element={<TaskEditPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
