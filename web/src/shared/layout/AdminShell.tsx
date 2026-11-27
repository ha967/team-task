import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { MobileNav, Sidebar, useSidebarCollapsed } from './Sidebar';
import { Topbar } from './Topbar';

const BLURB = '小团队 · 团队协作与任务管理';

function getViewTitle(pathname: string) {
  if (pathname === '/teams') {
    return '团队';
  }

  if (pathname === '/teams/new') {
    return '新建团队';
  }

  if (pathname.startsWith('/teams/')) {
    return '团队详情';
  }

  if (pathname === '/tasks') {
    return '概览';
  }

  if (pathname === '/tasks/new') {
    return '新建任务';
  }

  if (pathname.endsWith('/edit')) {
    return '编辑任务';
  }

  return '任务详情';
}

/**
 * 登录后的应用外壳：固定侧栏 + 顶部栏 + 内容区。
 * 路由本身不动，只把 ProtectedRoute 下面这组页面包进来。
 */
export function AdminShell() {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => {
          setCollapsed(!collapsed);
        }}
      />

      <div
        className={`transition-[padding] duration-200 ${
          collapsed ? 'nav:pl-16' : 'nav:pl-[232px]'
        }`}
      >
        <Topbar title={getViewTitle(pathname)} subtitle={BLURB} />

        <main className="mx-auto w-full max-w-shell px-5 pb-28 pt-6 nav:px-8 nav:pb-10 nav:pt-7">
          <motion.div
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.24,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
