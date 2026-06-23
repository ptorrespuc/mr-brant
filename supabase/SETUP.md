# Configuração do Supabase — Mr.Brant

Siga na ordem. Leva ~10 minutos.

## 1. Criar o projeto
1. Entre em https://supabase.com/dashboard
2. **New project** → nome `mr-brant` → escolha uma senha forte para o banco (guarde) → região **South America (São Paulo)** → **Create**
3. Aguarde ~2 min até o projeto ficar pronto.

## 2. Criar as tabelas
1. No menu lateral: **SQL Editor** → **New query**
2. Cole TODO o conteúdo de [`schema.sql`](schema.sql) → **Run**
3. Deve aparecer "Success".

## 3. Criar o bucket de fotos
1. Menu lateral: **Storage** → **New bucket**
2. Nome: `products`
3. Marque **Public bucket** ✅ → **Save**

## 4. Políticas do Storage
1. **SQL Editor** → **New query**
2. Cole o conteúdo de [`storage.sql`](storage.sql) → **Run**

## 5. Dados iniciais (opcional, recomendado)
1. **SQL Editor** → **New query**
2. Cole o conteúdo de [`seed.sql`](seed.sql) → **Run**
3. Isso cria as 11 categorias, subcategorias e os 4 produtos atuais.
4. **Importante:** as fotos ainda precisam ser enviadas ao Storage (passo 6).

## 6. Subir as fotos
No **Storage → products**, crie as pastas e suba as imagens com estes nomes:
```
exu-caveira/1.jpeg ... 4.jpeg
oxum/1.jpeg ... 4.jpeg
maria-padilha-almas/1.jpeg ... 5.jpeg
pombagira-rainha/1.jpeg ... 4.jpeg
```
(São as mesmas que já estão em `assets/products/`.)
> Depois que o admin estiver pronto, novas fotos sobem direto por lá.

## 7. Criar seu usuário de admin
1. Menu lateral: **Authentication** → **Users** → **Add user** → **Create new user**
2. Informe seu e-mail e uma senha → marque **Auto Confirm User** → **Create**
3. Esse será o login do painel de admin.

## 8. Pegar as chaves de conexão
1. Menu lateral: **Project Settings** (engrenagem) → **API**
2. Copie:
   - **Project URL** (ex.: `https://xxxx.supabase.co`)
   - **anon public** key (uma chave longa)
3. Me passe esses dois valores — vou conectar o site a eles.

> A chave `anon` é segura para ficar no frontend: o RLS (configurado no schema) garante que só leitura é pública; escrita exige login.
