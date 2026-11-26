/** Padrão visual FAL/InTAX (o mesmo do PdfService): cores, margens e logo. */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const VERDE = '#197148';
export const VERDE_ESCURO = '#123424';
export const TEXTO = '#1c2b24';
export const CINZA = '#5b6b63';
export const AMBAR = '#b8861f';
export const AMBAR_FUNDO = '#fbf0da';
export const BORDA = '#dce5e0';
export const FUNDO_CARD = '#eef3f0';
export const BRANCO = '#ffffff';

export const MARGEM = 48;
/** Topo do conteúdo nas páginas 2 em diante (abaixo do cabeçalho corrido). */
export const MARGEM_TOPO = 62;
export const SITE = 'simulador.clarityib.com.br';

/** Logo FAL Agro (backend/assets). Sem o arquivo, o cabeçalho escreve "FAL Agro". */
const LOGO_PATH = join(process.cwd(), 'assets', 'logo-fal-agro.png');
export const LOGO: Buffer | null = existsSync(LOGO_PATH) ? readFileSync(LOGO_PATH) : null;
