
-- Safely update the campaign_public view to include www_name and route_path

CREATE OR REPLACE VIEW grida_west_referral.campaign_public AS
SELECT
  c.id,
  c.title,
  c.description,
  c.layout_id,
  c.enabled,
  c.max_invitations_per_referrer,
  c.reward_currency,
  c.scheduling_open_at,
  c.scheduling_close_at,
  c.scheduling_tz,
  c.public,
  r.www_name,
  r.route_path AS www_route_path
FROM grida_west_referral.campaign c
LEFT JOIN grida_www.public_route r ON r.id = c.layout_id;

GRANT SELECT ON grida_west_referral.campaign_public TO anon, authenticated, service_role;