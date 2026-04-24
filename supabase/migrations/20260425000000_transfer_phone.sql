-- Ajoute le numéro de transfert intelligent sur le profil artisan
alter table profiles add column if not exists transfer_phone text;
