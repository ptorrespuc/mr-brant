-- ============================================================
-- Mr.Brant — Dados iniciais (categorias, subcategorias e os 4 produtos do protótipo)
-- Rode DEPOIS do schema.sql.
-- As fotos precisam ser enviadas ao Storage (bucket "products") com os
-- mesmos caminhos referenciados em product_images abaixo.
-- ============================================================

-- ---------- CATEGORIAS ----------
insert into categories (slug, name, sort) values
  ('imagens',            'Imagens',              0),
  ('velas',              'Velas',                1),
  ('guias-colares',      'Guias e Colares',      2),
  ('firmas-ferramentas', 'Firmas e Ferramentas', 3),
  ('incensos',           'Incensos',             4),
  ('defumadores',        'Defumadores',          5),
  ('banhos-ervas',       'Banhos e Ervas',       6),
  ('quartinhas',         'Quartinhas',           7),
  ('pembas',             'Pembas',               8),
  ('kits-orixas',        'Kits para Orixás',     9),
  ('decoracao',          'Decoração Religiosa', 10)
on conflict (slug) do nothing;

-- ---------- SUBCATEGORIAS (de "Imagens") ----------
insert into subcategories (category_id, slug, name, sort)
select c.id, s.slug, s.name, s.sort
from categories c
cross join (values
  ('orixas',       'Orixás',        0),
  ('caboclos',     'Caboclos',      1),
  ('pretos-velhos','Pretos Velhos', 2),
  ('criancas',     'Crianças',      3),
  ('exus',         'Exus',          4),
  ('pombagiras',   'Pombagiras',    5),
  ('malandros',    'Malandros',     6),
  ('marinheiros',  'Marinheiros',   7),
  ('baianos',      'Baianos',       8),
  ('boiadeiros',   'Boiadeiros',    9),
  ('ciganos',      'Ciganos',      10),
  ('outros-guias', 'Outros Guias', 11)
) as s(slug, name, sort)
where c.slug = 'imagens'
on conflict (category_id, slug) do nothing;

-- ---------- PRODUTOS ----------
-- Helper: pega id da categoria "imagens" e das subcategorias
do $$
declare
  cat_img uuid;
  sub_exus uuid; sub_orixas uuid; sub_pomba uuid;
  p_exu uuid; p_oxum uuid; p_mpa uuid; p_pr uuid;
begin
  select id into cat_img from categories where slug='imagens';
  select id into sub_exus   from subcategories where slug='exus'       and category_id=cat_img;
  select id into sub_orixas from subcategories where slug='orixas'     and category_id=cat_img;
  select id into sub_pomba  from subcategories where slug='pombagiras' and category_id=cat_img;

  -- Exu Caveira
  insert into products (slug, name, tagline, category_id, subcategory_id, descriptions, specs, sort)
  values ('exu-caveira', 'Exu Caveira', 'Guardião dos caminhos e dos cemitérios.', cat_img, sub_exus,
    '["A imagem representa Exu Caveira, guardião dos caminhos e dos cemitérios — símbolo de força, sabedoria e abertura de caminhos espirituais.","Produzida em PLA de alta qualidade e finalizada manualmente. Cada peça é pintada à mão, tornando-se única e exclusiva.","Ideal para quem busca proteção, firmeza e uma peça decorativa de profundo valor simbólico."]'::jsonb,
    '[{"k":"Material","v":"PLA ou PETG resistente (uso interno)"},{"k":"Resistência","v":"PLA até 60°C · PETG até 80°C"},{"k":"Cor","v":"Preto com detalhes em vermelho"},{"k":"Acabamento","v":"Brilho e pintura artesanal"}]'::jsonb, 0)
  returning id into p_exu;
  insert into product_sizes (product_id, label, price_cents, sort) values
    (p_exu,'18 cm',8990,0),(p_exu,'20 cm',9990,1),(p_exu,'22 cm',10990,2),(p_exu,'25 cm',12990,3),(p_exu,'30 cm',15990,4),(p_exu,'40 cm',21990,5),(p_exu,'50 cm',28990,6);
  insert into product_images (product_id, path, sort) values
    (p_exu,'exu-caveira/1.jpeg',0),(p_exu,'exu-caveira/2.jpeg',1),(p_exu,'exu-caveira/3.jpeg',2),(p_exu,'exu-caveira/4.jpeg',3);

  -- Oxum
  insert into products (slug, name, tagline, category_id, subcategory_id, descriptions, specs, sort)
  values ('oxum', 'Oxum', 'Orixá do amor, da beleza e da prosperidade.', cat_img, sub_orixas,
    '["Escultura de Oxum em posição serena, segurando seu espelho, com coroa e manto ricamente esculpidos.","Acabamento em dourado e preto brilhante, simbolizando o ouro, a feminilidade e a força espiritual desta poderosa Orixá. Ideal para altares, decoração, coleção ou presente com significado.","Oxum representa o amor, a fertilidade e as águas doces — uma energia de suavidade e poder que traz harmonia e prosperidade ao ambiente."]'::jsonb,
    '[{"k":"Material","v":"PLA"},{"k":"Acabamento","v":"Pintura dourada com detalhes em preto"},{"k":"Base","v":"Firme, pronta para exposição"},{"k":"Produção","v":"Artesanal — cada peça é única"}]'::jsonb, 1)
  returning id into p_oxum;
  insert into product_sizes (product_id, label, price_cents, sort) values
    (p_oxum,'18 cm',7990,0),(p_oxum,'20 cm',8990,1),(p_oxum,'22 cm',9990,2),(p_oxum,'25 cm',11990,3);
  insert into product_images (product_id, path, sort) values
    (p_oxum,'oxum/1.jpeg',0),(p_oxum,'oxum/2.jpeg',1),(p_oxum,'oxum/3.jpeg',2),(p_oxum,'oxum/4.jpeg',3);

  -- Maria Padilha das Almas
  insert into products (slug, name, tagline, category_id, subcategory_id, note, descriptions, specs, sort)
  values ('maria-padilha-almas', 'Maria Padilha das Almas', 'Elegância, poder e mistério em uma obra única.', cat_img, sub_pomba,
    'Personalizamos com as suas cores.',
    '["Imponente, sedutora e cheia de presença — muito mais que decoração, é uma expressão de força espiritual, beleza e personalidade.","Vestida em traje vermelho com detalhes em preto, taça na mão e postura firme. O acabamento brilhante valoriza cada dobra do vestido e a expressão marcante.","Base reforçada com o nome em alto relevo. Uma peça que transmite respeito, força feminina e magnetismo."]'::jsonb,
    '[{"k":"Acabamento","v":"Premium, pintura sofisticada com brilho"},{"k":"Base","v":"Reforçada, com nome em alto relevo"},{"k":"Personalização","v":"Sob encomenda, nas suas cores"},{"k":"Produção","v":"Artesanal, atenção aos detalhes"}]'::jsonb, 2)
  returning id into p_mpa;
  insert into product_sizes (product_id, label, price_cents, sort) values
    (p_mpa,'30 cm',18990,0),(p_mpa,'40 cm',25990,1),(p_mpa,'50 cm',33990,2),(p_mpa,'60 cm',42990,3);
  insert into product_images (product_id, path, sort) values
    (p_mpa,'maria-padilha-almas/1.jpeg',0),(p_mpa,'maria-padilha-almas/2.jpeg',1),(p_mpa,'maria-padilha-almas/3.jpeg',2),(p_mpa,'maria-padilha-almas/4.jpeg',3),(p_mpa,'maria-padilha-almas/5.jpeg',4);

  -- Maria Padilha Rainha das Sete Encruzilhadas
  insert into products (slug, name, tagline, category_id, subcategory_id, obs, descriptions, specs, sort)
  values ('pombagira-rainha', 'Maria Padilha — Rainha das Sete Encruzilhadas', 'Poder, sedução, proteção e caminhos abertos.', cat_img, sub_pomba,
    'A guia em sua mão não acompanha o produto.',
    '["Maria Padilha, Rainha das Sete Encruzilhadas — força, elegância e poder para o seu lar ou espaço espiritual.","Produzida em PLA com preenchimento em gesso, garantindo excelente peso, estabilidade e acabamento superior. Pintura artesanal, cores vivas e brilho realçado.","Vestida em preto e vermelho, com coroa dourada, taça e colar em destaque — símbolo de poder, sedução, proteção e caminhos abertos."]'::jsonb,
    '[{"k":"Material","v":"PLA com preenchimento em gesso"},{"k":"Acabamento","v":"Pintura manual, brilho realçado"},{"k":"Indicado para","v":"Altares, casas, lojas e presentes"},{"k":"Tamanho","v":"Conforme variação"}]'::jsonb, 3)
  returning id into p_pr;
  insert into product_sizes (product_id, label, price_cents, sort) values
    (p_pr,'30 cm',21990,0),(p_pr,'40 cm',29990,1),(p_pr,'50 cm',38990,2);
  insert into product_images (product_id, path, sort) values
    (p_pr,'pombagira-rainha/1.jpeg',0),(p_pr,'pombagira-rainha/2.jpeg',1),(p_pr,'pombagira-rainha/3.jpeg',2),(p_pr,'pombagira-rainha/4.jpeg',3);

  -- Relacionamento: as duas Pombagiras se relacionam
  insert into product_relations (product_id, related_product_id) values
    (p_mpa, p_pr), (p_pr, p_mpa)
  on conflict do nothing;
end $$;
