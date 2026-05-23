# EV Exec

Premium airport transfer website with backend lead capture, Supabase API routes, admin leads dashboard, and deployment setup.

## Features

- Premium airport transfer landing page
- Mobile responsive design
- Real customer reviews
- Airport transfer pricing
- Areas covered section
- Backend lead capture system
- Supabase integration
- Admin dashboard
- Deployment ready setup

## Frontend Image Placement

The website frontend is programmed to feature airport route images in the airport route cards. The images should stay in the exact positions already defined in the HTML.

Do not redesign the layout, move sections, place writing over images, or change the image card structure. The README documents which image belongs in each programmed route position.

## Airport Routes Featured

The website currently includes custom airport route imagery for:

| Route Card Position | Airport | Image To Use | Website Placement |
| --- | --- | --- | --- |
| 1 | Manchester Airport | Manchester Airport Tesla / EV Exec image | First airport route card |
| 2 | Liverpool Airport | Liverpool Airport Tesla / EV Exec image | Second airport route card |
| 3 | Leeds Bradford Airport | Leeds Bradford Airport Tesla / EV Exec image | Third airport route card |
| 4 | Birmingham Airport | Birmingham Airport Tesla / EV Exec image | Fourth airport route card |
| 5 | Newcastle Airport | Newcastle Airport Tesla / EV Exec image | Fifth airport route card |

## Image Rules

- Keep the current website design and picture positions exactly as programmed in the HTML.
- Do not place text or writing over route images.
- Do not replace the premium dark theme.
- Do not add emojis.
- Do not move route cards around.
- Use the correct airport image for the matching airport route.
- Keep image sizing consistent across all airport cards.
- Keep images optimised for fast loading where possible.

## Recommended Image Paths

If images are stored as separate files, use simple predictable paths such as:

```bash
assets/images/manchester-airport.jpg
assets/images/liverpool-airport.jpg
assets/images/leeds-bradford-airport.jpg
assets/images/birmingham-airport.jpg
assets/images/newcastle-airport.jpg
```

If the current HTML uses embedded/base64 images, keep the embedded images in their existing programmed locations unless deliberately converting them to external files.

## Project Structure

```bash
admin/        # Admin dashboard
api/          # API routes
docs/         # Documentation
supabase/     # Database setup
index.html    # Main website
```

## Deployment

After updating images or `index.html`, redeploy the Vercel project and hard refresh the live site.
