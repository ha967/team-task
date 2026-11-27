import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { TaskCreatePage } from '../features/tasks/pages/TaskCreatePage';
import { TaskDetailPage } from '../features/tasks/pages/TaskDetailPage';
import { TaskEditPage } from '../features/tasks/pages/TaskEditPage';
import { TasksPage } from '../features/tasks/pages/TasksPage';
import { TeamCreatePage } from '../features/teams/pages/TeamCreatePage';
import { TeamDetailPage } from '../features/teams/pages/TeamDetailPage';
import { TeamsPage } from '../features/teams/pages/TeamsPage';
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

              {/* 静态段 /teams/new 写在 /teams/:teamId 前面，读起来更直观；
                  react-router 本身会按「静态段优先」打分匹配 */}
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/teams/new" element={<TeamCreatePage />} />
              <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
