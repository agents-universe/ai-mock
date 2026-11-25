import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return (
    <div className="min-h-full flex flex-col">
      <header className="h-13 border-b border-slate-200 bg-white px-4 flex items-center gap-6 sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="w-7 h-7 rounded bg-blue-600 text-white grid place-items-center text-sm">M</span>
          ai-mock
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink to="/" active={loc.pathname === '/'}>项目</NavLink>
          <NavLink to="/settings/database" active={loc.pathname === '/settings/database'}>
            数据库设置
          </NavLink>
          <NavLink to="/settings/tokens" active={loc.pathname === '/settings/tokens'}>
            访问 Token
          </NavLink>
        </nav>
        <div className="ml-auto text-xs text-slate-400">Mock 服务: /mock/{'{project}'}/{'{env}'}/...</div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md ${
        active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </Link>
  );
}
