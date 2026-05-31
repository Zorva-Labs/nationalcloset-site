-- Each window can be assigned a wall (back / left / right / front from the
-- entry's perspective) so the project page can render a top-down floor plan
-- and the installer worksheet can show exactly which window is which.
ALTER TABLE windows ADD COLUMN wall TEXT;  -- back | right | front | left
