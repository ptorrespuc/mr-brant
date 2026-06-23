# Configuração do Frete (Melhor Envio)

Siga na ordem.

## 1. Banco de dados
No **SQL Editor**, rode o conteúdo de [`frete.sql`](frete.sql).
Isso adiciona peso/dimensões por tamanho e as configurações de frete.

## 2. Conta no Melhor Envio
1. Crie uma conta em https://melhorenvio.com.br (gratuita).
2. Para testar primeiro, use o **sandbox**: https://sandbox.melhorenvio.com.br
3. Gere um **token de API**:
   - Painel → **Integrações / Configurações → Tokens** (ou **Gerenciar Tokens**)
   - Crie um token. Marque o escopo de **cálculo de fretes** (`shipping-calculate`).
   - Copie o token (uma string longa). **Guarde — não é exibido de novo.**

> Para o sandbox, gere o token dentro do painel sandbox. Para produção, no painel normal.

## 3. Edge Function no Supabase
A função `calcular-frete` chama o Melhor Envio com o token em segredo.

**Opção A — pelo painel (sem instalar nada):**
1. Supabase → menu lateral **Edge Functions** → **Create a new function**
2. Nome: `calcular-frete`
3. Apague o conteúdo de exemplo e cole o código de [`functions/calcular-frete/index.ts`](functions/calcular-frete/index.ts)
4. **Deploy**

**Opção B — pela CLI** (se tiver o Supabase CLI):
```bash
supabase functions deploy calcular-frete
```

## 4. Guardar o token (segredo)
1. Supabase → **Edge Functions** → **Secrets** (ou **Project Settings → Edge Functions → Secrets**)
2. Adicione:
   - Nome: `MELHORENVIO_TOKEN`
   - Valor: o token do passo 2
3. Salve. (A função lê esse segredo; o token nunca vai para o navegador.)

## 5. Configurar no admin
No admin → **⚙ Configurações → Frete (Melhor Envio)**:
- **CEP de origem:** de onde você envia.
- **Pacote padrão:** peso e dimensões usados quando um tamanho não tem medidas.
- **Ambiente de teste (sandbox):** marque enquanto testa; desmarque para produção.

## 6. Peso e dimensões das peças
Ao cadastrar/editar uma imagem, cada **tamanho** tem campos de **peso (g)** e **dimensões (cm)**.
Preencha para um cálculo preciso. Se deixar vazio, usa o pacote padrão das Configurações.

## Pronto!
No site, em cada produto e na sacola, o cliente digita o CEP e vê as opções de frete (PAC, SEDEX, transportadoras) com prazo e valor.

> Dica: comece no **sandbox** para validar. Os valores do sandbox são fictícios. Quando estiver ok, gere o token de produção, troque o segredo e desmarque o sandbox no admin.
