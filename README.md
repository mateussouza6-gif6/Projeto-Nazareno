# Árvores de Nazareno

Aplicativo de inventário arbóreo digital e educação ambiental, iniciado para a Praça Central de Nazareno–MG e preparado para expansão a outras áreas públicas do município.

## Objetivos do produto

- Cadastro técnico individual de cada árvore, com código padronizado (ex.: NAZ-PRA-001).
- Identificação botânica: nome popular, nome científico, família e origem.
- Dendrometria: CAP, DAP calculado por CAP / π e altura estimada.
- Avaliação visual, estado fitossanitário, pragas, doenças, poda e conflitos urbanos.
- Fotografias da árvore inteira, tronco, copa e detalhes botânicos.
- Coordenadas geográficas e mapa interativo.
- Ficha pública acessível por QR Code individual.
- Histórico de manejo, atualização do inventário e exportação de dados.
- Conteúdo educativo e circuito das árvores, incluindo atividades escolares.

## Tecnologias

- Vite + JavaScript (interface web responsiva).
- Capacitor 7 para empacotamento Android.
- Supabase (a integrar): autenticação, banco PostgreSQL, armazenamento de fotografias e políticas RLS.
- Leaflet para cartografia e QR Code para identificação individual.

## Desenvolvimento local

Requisitos: Node.js LTS e npm.

```bash
npm install
npm run dev
```

## Aplicativo Android

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

No Android Studio, gere o APK de teste por **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

## Configuração e segurança

1. Criar um projeto Supabase exclusivo para esta aplicação.
2. Configurar as variáveis de ambiente locais em `.env.local`, usando `.env.example` como modelo.
3. Aplicar o esquema SQL versionado em `supabase/migrations`.
4. Habilitar RLS em todas as tabelas expostas e testar permissões de visitante, usuário autenticado e administrador.
5. Usar apenas chave publishable/anon no cliente. Nunca incluir `service_role`, tokens privados ou senhas no aplicativo ou no Git.
6. Restringir operações administrativas por políticas no banco, não apenas por controles visuais da interface.

## Integridade dos dados

O aplicativo não deve inventar registros de árvores, medições, coordenadas, fotografias ou identificações botânicas. Campos ainda não levantados devem permanecer vazios ou com status **Pendente de identificação**. Dados demonstrativos não serão apresentados como inventário real.

## Situação do desenvolvimento

Este repositório inicia a nova implementação. A integração com Supabase, as migrações, o fluxo de autenticação, o armazenamento de fotos e a geração final do APK serão concluídos e testados nas próximas etapas.
