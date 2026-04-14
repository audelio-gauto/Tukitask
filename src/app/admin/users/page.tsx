'use client';         
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const roles = ['admin', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente'];
const roleFilters = ['all', ...roles];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const LIMIT = 25;

  // Create user form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('driver');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Edit user
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('driver');

  const fetchUsers = useCallback(async (pg: number, q: string, r: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      if (r !== 'all') params.set('role', r);
      
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (res.ok) {
        setUsers(json.data || []);
        setTotal(json.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    setPage(1);
    fetchUsers(1, query, filter); 
  }, [filter, fetchUsers, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search);
    fetchUsers(1, search, filter);
  };

  const goPage = (pg: number) => {
    setPage(pg);
    fetchUsers(pg, query, filter);
  };

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setErrorMsg('');
    setSuccessMsg('');
    if (!newEmail || !newPassword) { setErrorMsg('Email y contraseña son obligatorios'); setCreating(false); return; }
    if (newPassword.length < 6) { setErrorMsg('La contraseña debe tener al menos 6 caracteres'); setCreating(false); return; }
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error || 'Error al crear usuario');
      } else {
        setSuccessMsg('Usuario creado correctamente');
        setNewEmail('');
        setNewPassword('');
        setNewRole('driver');
        setShowForm(false);
        fetchUsers(page, query, filter);
      }
    } catch {
      setErrorMsg('Error de conexión');
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (window.confirm('¿Seguro que deseas eliminar este usuario?')) {
      await supabase.from('users').delete().eq('id', id);
      fetchUsers(page, query, filter);
    }
  }

  function startEdit(user: any) {
    setEditing(user.id);
    setEditRole(user.role);
  }

  async function handleEdit(id: string) {
    await supabase.from('users').update({ role: editRole }).eq('id', id);
    setEditing(null);
    fetchUsers(page, query, filter);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} usuarios registrados`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsers(page, query, filter)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            Actualizar
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 bg-[#F5C518] text-[#1C1C2E] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#E6A800] transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Create User Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Crear nuevo usuario</h3>
          <form onSubmit={handleCreateUser} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none placeholder:text-gray-400"
                placeholder="usuario@email.com"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none placeholder:text-gray-400"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none bg-white"
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <button
                type="submit"
                disabled={creating}
                className="w-full sm:w-auto bg-[#1C1C2E] text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {creating ? '...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setErrorMsg(''); }}
                className="w-full sm:w-auto bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors border border-gray-200"
              >
                Cerrar
              </button>
            </div>
          </form>
          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 flex items-center gap-2">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {successMsg}
            </div>
          )}
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <form onSubmit={handleSearch} className="flex-1 w-full relative">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar por email</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="usuario@ejemplo.com..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none placeholder:text-gray-400"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 border border-gray-200 transition-colors">
                Buscar
              </button>
            </div>
          </form>
          
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Filtrar Rol</label>
            <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100/50 rounded-lg border border-gray-100">
              {roleFilters.map(r => (
                <button
                  key={r}
                  onClick={() => setFilter(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${filter === r
                      ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                      : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  {r === 'all' ? 'Todos' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {query && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-500">Resultados para: <strong className="text-gray-800">"{query}"</strong></span>
            <button onClick={() => {setSearch(''); setQuery(''); fetchUsers(1, '', filter);}} className="text-xs text-blue-600 hover:underline">Limpiar búsqueda</button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-gray-500 font-medium">No se encontraron usuarios</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Registro</th>
                  <th className="text-right py-3.5 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u, i) => (
                  <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-indigo-600">{u.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-gray-800 font-medium">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {editing === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value)}
                          className="border border-gray-300 rounded shadow-sm px-2 py-1 text-sm focus:ring-2 focus:ring-[#F5C518] outline-none bg-white"
                        >
                          {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                          ${u.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200' :
                            u.role === 'driver' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            u.role === 'vendedor' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            u.role === 'servicio' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                            u.role === 'hoteleria' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-gray-100 text-gray-700 border-gray-300'}`}
                        >
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-500">
                      {new Date(u.created_at).toLocaleDateString('es-PY', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        {editing === u.id ? (
                          <>
                            <button
                              onClick={() => handleEdit(u.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                            >
                               Guardar
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="inline-flex items-center px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(u)}
                              className="inline-flex items-center gap-1 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar rol"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="inline-flex items-center gap-1 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar usuario"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-500">
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString('es-PY')}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700 bg-white shadow-sm"
            >
              ← Anterior
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-8 h-8 text-sm rounded-lg transition-colors font-medium shadow-sm ${
                      p === page
                        ? 'bg-[#1C1C2E] text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700 bg-white shadow-sm"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const roles = ['admin', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente'];
const roleFilters = ['all', ...roles];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Create user form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('driver');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Edit user
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('driver');

  useEffect(() => {
    fetchUsers();
  }, [filter]);

  async function fetchUsers() {
    setLoading(true);
    let query = supabase.from('users').select('*').order('created_at', { ascending: false });
    if (filter !== 'all') query = query.eq('role', filter);
    const { data } = await query;
    setUsers(data || []);
    setLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setErrorMsg('');
    setSuccessMsg('');
    if (!newEmail || !newPassword) { setErrorMsg('Email y contraseña son obligatorios'); setCreating(false); return; }
    if (newPassword.length < 6) { setErrorMsg('La contraseña debe tener al menos 6 caracteres'); setCreating(false); return; }
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error || 'Error al crear usuario');
      } else {
        setSuccessMsg('Usuario creado correctamente');
        setNewEmail('');
        setNewPassword('');
        setNewRole('driver');
        setShowForm(false);
        fetchUsers();
      }
    } catch {
      setErrorMsg('Error de conexión');
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (window.confirm('¿Seguro que deseas eliminar este usuario?')) {
      await supabase.from('users').delete().eq('id', id);
      fetchUsers();
    }
  }

  function startEdit(user: any) {
    setEditing(user.id);
    setEditRole(user.role);
  }

  async function handleEdit(id: string) {
    await supabase.from('users').update({ role: editRole }).eq('id', id);
    setEditing(null);
    fetchUsers();
  }

  const filteredUsers = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona todos los usuarios del sistema</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 bg-[#F5C518] text-[#1C1C2E] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#E6A800] transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Nuevo Usuario
        </button>
      </div>

      {/* Create User Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Crear nuevo usuario</h3>
          <form onSubmit={handleCreateUser} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none"
                placeholder="usuario@email.com"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none"
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="bg-[#F5C518] text-[#1C1C2E] px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#E6A800] transition-colors disabled:opacity-50"
              >
                {creating ? 'Creando...' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setErrorMsg(''); }}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
          {errorMsg && (
            <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{errorMsg}</div>
          )}
          {successMsg && (
            <div className="mt-3 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">{successMsg}</div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Rol:</span>
            <div className="flex flex-wrap gap-1.5">
              {roleFilters.map(r => (
                <button
                  key={r}
                  onClick={() => setFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${filter === r
                      ? 'bg-[#F5C518] text-[#1C1C2E]'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {r === 'all' ? 'Todos' : r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha Registro</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#FEF9E7] rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-[#C8960A]">{u.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-gray-700 font-medium">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {editing === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-[#F5C518] outline-none"
                        >
                          {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${u.role === 'admin' ? 'bg-red-100 text-red-800' :
                            u.role === 'driver' ? 'bg-emerald-100 text-emerald-800' :
                            u.role === 'vendedor' ? 'bg-amber-100 text-amber-800' :
                            u.role === 'servicio' ? 'bg-sky-100 text-sky-800' :
                            u.role === 'hoteleria' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'}`}
                        >
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(u.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {editing === u.id ? (
                          <>
                            <button
                              onClick={() => handleEdit(u.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(u)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FEF9E7] text-[#C8960A] rounded-lg text-xs font-medium hover:bg-[#F5C518]/20 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2m22 4l-5-5m0 0l-5 5m5-5v12" />
                      </svg>
                      <p>No se encontraron usuarios</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer count */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          Mostrando {filteredUsers.length} de {users.length} usuarios
        </div>
      </div>
    </div>
  );
}
