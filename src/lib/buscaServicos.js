const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const STOP = new Set(['de','do','da','dos','das','e','em','para','com','por','a','o','os','as','servico','servicos']);
const CODIGOS = ['item_lc116','nbs','ind_op','c_class_trib'];
export function buscarServicos(data, termo, campo = 'todos') {
  const q = norm(termo); if (!q) return [];
  const tokens = q.split(' ').filter(t => !STOP.has(t));
  const numerico = /^[\d.\s-]+$/.test(String(termo));
  const digitos = String(termo).replace(/\D/g,'');
  if (!numerico && !tokens.length) return [];
  const textos = campo === 'todos' ? ['descricao_item','descricao_nbs','nome_class_trib'] : [campo];
  const codes = campo === 'todos' ? CODIGOS : CODIGOS.includes(campo) ? [campo] : [];
  const resultados = data.map((r, indice) => {
    let score = 0;
    if (numerico) {
      for (const k of codes) {
        const d = String(r[k] || '').replace(/\D/g,'');
        if (d && d === digitos) score = Math.max(score,1000);
        else if (digitos.length >= 3 && d.startsWith(digitos)) score = Math.max(score,500);
      }
    } else {
      const valores = textos.map(k => norm(r[k]));
      // Todos os termos relevantes devem ocorrer na descrição ou classificação.
      const junto = valores.join(' ');
      const palavras = junto.split(' ');
      if (tokens.every(t => palavras.some(p => p === t || (t.length >= 4 && p.startsWith(t))))) {
        score = 100 + tokens.length * 10;
        if (valores.some(v => v === q)) score += 200;
        else if (valores.some(v => v.includes(q))) score += 80;
        if (norm(r.descricao_nbs).includes(q)) score += 40;
      }
    }
    return { r, score, indice };
  }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || a.indice-b.indice);
  const vistos = new Set();
  return resultados.filter(({r}) => { const key = [...CODIGOS,'descricao_item','descricao_nbs','local_incidencia_ibs','ps_onerosa','adq_exterior'].map(k => r[k] || '').join('|'); if(vistos.has(key)) return false; vistos.add(key); return true; }).map(x => x.r);
}
