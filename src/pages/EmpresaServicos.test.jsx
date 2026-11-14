import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmpresaServicos from './EmpresaServicos';
import Layout from '../components/Layout';
// O menu lateral mostra a conta logada e o botão Sair, então o Layout precisa do contexto de autenticação.
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Maria Souza', email: 'maria@exemplo.test', role: 'user' }, logout: () => {} }) }));
describe('navegação por empresa', () => {
 it('mantém somente os recursos globais na sidebar', () => {
  const qc = new QueryClient();
  const html = renderToString(<QueryClientProvider client={qc}><MemoryRouter><Layout /></MemoryRouter></QueryClientProvider>);
  // a área da tela aberta vem aberta (Clientes, em "/"); as demais aparecem recolhidas, cada uma com a sua página
  expect(html).toContain('Clientes'); expect(html).toContain('Consultoria Tributária'); expect(html).toContain('href="/area/diagnostico"');
  expect(html).not.toContain('Novo Diagnóstico'); expect(html).not.toContain('Calculadora Rápida'); expect(html).not.toContain('Validador de cadastro');
  const reforma = renderToString(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/ferramentas/consulta-ncm']}><Layout /></MemoryRouter></QueryClientProvider>);
  expect(reforma).toContain('Consulta NCM'); expect(reforma).not.toContain('Novo Diagnóstico');
 });
 it('abre os serviços e o histórico no contexto da empresa', () => {
  const qc = new QueryClient();
  qc.setQueryData(['analises-empresa','empresa-a'],[{id:'salva',servico:'validador-nfse',titulo:'Documento A',createdAt:'2026-10-16T12:00:00Z'}]);
  qc.setQueryData(['validacoes-cadastro','empresa-a'],[]);
  const html = renderToString(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/workroom/grupo-a/empresas/empresa-a']}><Routes><Route path="/workroom/:id/empresas/:empresaId" element={<Outlet context={{empresa:{razao_social:'Empresa A'}}}/>}><Route index element={<EmpresaServicos/>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
  expect(html).toContain('/workroom/grupo-a/empresas/empresa-a/classificacao-servicos'); expect(html).toContain('/workroom/grupo-a/empresas/empresa-a/validador-nfse?analise=salva'); expect(html).toContain('Empresa A');
  // cada um dos cinco serviços tem o seu botão da lista de solicitações
  expect(html.split('Lista de solicitações (Excel)').length - 1).toBe(5);
 });
});
