# Configuração do Supabase

O banco foi modelado na migração `migrations/202611070001_initial_schema.sql`.

## 1. Criar o projeto

Crie um projeto Supabase exclusivo para **Árvores de Nazareno**. Não reutilize credenciais de outro projeto sem revisar o isolamento e as permissões.

## 2. Aplicar a migração

No painel do Supabase, abra **SQL Editor**, cole o conteúdo da migração inicial e execute. Ela cria as tabelas, índices, funções, gatilhos, políticas RLS, bucket privado de fotografias e a área piloto Praça Central (prefixo PRA). Não cria registros de árvores fictícios.

## 3. Configurar o aplicativo

Copie `.env.example` para `.env.local` e preencha:
- `VITE_SUPABASE_URL`: URL do projeto.
- `VITE_SUPABASE_ANON_KEY`: chave publishable/anon do cliente.

Esses valores são usados pelo frontend. Nunca use `service_role`, `sb_secret_`, senha de banco ou token administrativo no cliente.

## 4. Criar o primeiro administrador

1. Em **Authentication > Users**, crie o usuário responsável.
2. Copie o UUID desse usuário.
3. No SQL Editor, execute a instrução abaixo substituindo o UUID pelo valor real:

```sql
update public.profiles
set role = 'admin'
where id = 'UUID-DO-USUARIO';
```

O perfil é criado automaticamente pelo gatilho de autenticação com a função `viewer`. A elevação para administrador deve ser feita por um operador autorizado no painel SQL.

## 5. Fotografias

O bucket `tree-photos` é privado, aceita JPEG, PNG e WebP com limite de 10 MB por arquivo. A leitura é permitida à equipe técnica e às fotografias vinculadas a árvores publicadas. Upload, alteração e exclusão exigem perfil de equipe (admin/editor).

## 6. Verificações antes de publicar

- Testar visitante anônimo, usuário viewer, editor e administrador.
- Confirmar que visitante não consegue inserir, editar ou excluir árvores.
- Confirmar que rascunhos e fotografias de árvores não publicadas não ficam acessíveis publicamente.
- Validar o tamanho e o tipo MIME de cada fotografia no cliente e no Storage.
- Revisar políticas RLS após qualquer alteração no esquema.
