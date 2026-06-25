# Configuração do Pagamento (Mercado Pago + e-mail Resend)

Siga na ordem. Comece tudo no **sandbox** (teste) e só depois vá para produção.

## 1. Banco de dados
No **SQL Editor**, rode o conteúdo de [`pedidos.sql`](pedidos.sql).
Cria as tabelas `orders`, `order_items`, `customers` e a configuração `mp_sandbox`.

## 2. Conta no Mercado Pago + Access Token
1. Acesse https://www.mercadopago.com.br/developers → **Suas integrações** → crie uma aplicação.
2. Em **Credenciais de teste**, copie o **Access Token** (começa com `TEST-...`).
3. Guarde — vamos usar no passo 4.
> Para produção depois: use o Access Token de **Credenciais de produção** (`APP_USR-...`).

## 3. Conta no Resend (e-mail de confirmação)
1. Crie conta em https://resend.com (gratuito).
2. **API Keys** → crie uma chave (começa com `re_...`).
3. **Domínio do remetente:**
   - Para **testar**: pode usar `onboarding@resend.dev` (só envia para o seu próprio e-mail cadastrado).
   - Para **produção**: verifique o seu domínio em **Domains** e use algo como `pedidos@seudominio.com.br`.

## 4. Subir as Edge Functions
Crie **3 funções** no Supabase (menu **Edge Functions → Create a new function**), colando o código de cada pasta:

| Função | Código |
|---|---|
| `criar-pedido`     | [`functions/criar-pedido/index.ts`](functions/criar-pedido/index.ts) |
| `webhook-mp`       | [`functions/webhook-mp/index.ts`](functions/webhook-mp/index.ts) |
| `consultar-pedido` | [`functions/consultar-pedido/index.ts`](functions/consultar-pedido/index.ts) |

> A função `calcular-frete` já existe (do frete). Estas são novas.

## 5. Segredos (Secrets)
Supabase → **Edge Functions → Secrets** (ou Project Settings → Edge Functions). Adicione:

| Nome | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago (teste agora; produção depois) |
| `RESEND_API_KEY`  | Chave do Resend (`re_...`) |

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente — não precisa criar.
> O **remetente** dos e-mails (`RESEND_FROM`) agora é configurado no **admin → ⚙ Configurações → E-mail (Resend)**, não é mais um segredo.

## 6. Webhook no Mercado Pago
A `criar-pedido` já manda a URL de notificação em cada cobrança, então normalmente **não precisa configurar nada**. Se quiser garantir, no painel do Mercado Pago → **Webhooks**, aponte para:
```
https://SEU-PROJETO.supabase.co/functions/v1/webhook-mp
```
e marque o evento **Pagamentos**.

## 7. Ativar no admin
Admin → **⚙ Configurações → Pagamento**: deixe **sandbox marcado** enquanto testa.

## 8. Testar
1. No site, adicione uma peça → **Sacola → Finalizar compra**.
2. Preencha dados, calcule o frete, **Ir para o pagamento**.
3. Use os **cartões de teste** do Mercado Pago (https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards) ou um Pix de teste.
4. Após pagar, você volta para a tela de **acompanhamento** e o pedido aparece no admin como **pago**.

## Ir para produção
1. Troque `MP_ACCESS_TOKEN` pelo de produção (`APP_USR-...`).
2. Verifique o domínio no Resend e ajuste `RESEND_FROM`.
3. No admin, **desmarque** o sandbox do Mercado Pago.
4. Faça uma compra real de baixo valor para validar ponta a ponta.
