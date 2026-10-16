import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmpresaServicos from './EmpresaServicos';
import Layout from '../components/Layout';
describe('navegação por empresa', () => {
 it('mantém somente os recursos globais na sidebar', () => {
  const html = renderToString(<MemoryRouter><Layout /></MemoryRouter>);
  expect(html).toContain('Grupos e empresas'); expect(html).toContain('Consulta NCM'); expect(html).not.toContain('Novo Diagnóstico'); expect(html).not.toContain('Calculadora Rápida'); expect(html).not.toContain('Validador de cadastro');
 });
 it('abre os serviços e o histórico no contexto da empresa', () => {
  const qc = new QueryClient();
  qc.setQueryData(['analises-empresa','empresa-a'],[{id:'salva',servico:'validador-nfse',titulo:'Documento A',createdAt:'2026-10-16T12:00:00Z'}]);
  qc.setQueryData(['validacoes-cadastro','empresa-a'],[]);
  const html = renderToString(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/workroom/grupo-a/empresas/empresa-a']}><Routes><Route path="/workroom/:id/empresas/:empresaId" element={<Outlet context={{empresa:{razao_social:'Empresa A'}}}/>}><Route index element={<EmpresaServicos/>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
  expect(html).toContain('/workroom/grupo-a/empresas/empresa-a/classificacao-servicos'); expect(html).toContain('/workroom/grupo-a/empresas/empresa-a/validador-nfse?analise=salva'); expect(html).toContain('Empresa A');
 });
});
