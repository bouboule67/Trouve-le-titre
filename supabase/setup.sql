-- Table des vidéos du jeu (à coller dans Supabase > SQL Editor > Run)
create table if not exists videos (
  id bigint generated always as identity primary key,
  url text not null unique,
  active boolean not null default true
);

-- La table reste privée : seul le serveur du jeu (clé secrète) peut la lire.
alter table videos enable row level security;

insert into videos (url) values
  ('https://www.youtube.com/watch?v=li8XGfdbbHQ'),
  ('https://www.youtube.com/watch?v=GUWmhacq6IA'),
  ('https://www.youtube.com/watch?v=D_DujjkjjqY'),
  ('https://www.youtube.com/watch?v=OV5iSTWc09A'),
  ('https://www.youtube.com/watch?v=mLm7uFjGlO8'),
  ('https://www.youtube.com/watch?v=EFsfqU0fzzY'),
  ('https://www.youtube.com/watch?v=8IH7J0_YvvQ'),
  ('https://www.youtube.com/watch?v=N1ZfIe47Dj4'),
  ('https://www.youtube.com/watch?v=eS009cRz-XU'),
  ('https://www.youtube.com/watch?v=TIVTNDfKgNQ'),
  ('https://www.youtube.com/watch?v=eBO2EOjdb-c'),
  ('https://www.youtube.com/watch?v=Rs5PQHm0j24'),
  ('https://www.youtube.com/watch?v=3wuSZLnKYrU'),
  ('https://www.youtube.com/watch?v=QeXaWaK-H_I'),
  ('https://www.youtube.com/watch?v=g-63F3-5-M4'),
  ('https://www.youtube.com/watch?v=5phjqy-IXjo'),
  ('https://www.youtube.com/watch?v=l1bW68QJMUI'),
  ('https://www.youtube.com/watch?v=8DlLSWhbTQ4'),
  ('https://www.youtube.com/watch?v=OEeLMA3c3Fw'),
  ('https://www.youtube.com/watch?v=48nn4j6q91M'),
  ('https://www.youtube.com/watch?v=MuIUNg338Cw'),
  ('https://www.youtube.com/watch?v=LDLbJ8tNEA0'),
  ('https://www.youtube.com/watch?v=4LZ4BuAkNyU'),
  ('https://www.youtube.com/watch?v=DZYDLoFtGj8'),
  ('https://www.youtube.com/watch?v=q5GVO8Slr1c'),
  ('https://www.youtube.com/watch?v=7MtQSSFUxOo'),
  ('https://www.youtube.com/watch?v=m-Muxghlqy0'),
  ('https://www.youtube.com/watch?v=rgMOooq-R94'),
  ('https://www.youtube.com/watch?v=yRYHazPbUVc'),
  ('https://www.youtube.com/watch?v=iYlODtkyw_I'),
  ('https://www.youtube.com/watch?v=TDv56whosPQ'),
  ('https://www.youtube.com/watch?v=F6PqxbvOCUI'),
  ('https://www.youtube.com/watch?v=Hwybp38GnZw'),
  ('https://www.youtube.com/watch?v=LeYsRMZFUq0'),
  ('https://www.youtube.com/watch?v=AiGKBNGlzHo'),
  ('https://www.youtube.com/watch?v=oI6aXhowFDY'),
  ('https://www.youtube.com/watch?v=d1010B3sKNQ')
on conflict (url) do nothing;
