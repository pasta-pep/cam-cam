# Fun Camera — How to Run

## To test on my phone:
1. In VSCode: FIRST make sure the correct FOLDER is open
   (File → Open Folder → my camera app folder — the one with index.html)

2. Right-click `index.html` → "Open with Live Server"
   - It opens in my browser. CHECK THE PORT in the address bar:
     usually http://localhost:5500, but sometimes 5501 if 5500 is busy

3. In Terminal, start the tunnel — MATCH THE PORT from step 2:
   ~/Documents/cloudflared tunnel --url http://localhost:5500
   (change 5500 to 5501 if that's what Live Server used)

4. Grab the NEW https://...trycloudflare.com URL it prints
   
5. Open that URL in Safari on my phone

## To stop:
- Terminal: Ctrl + C (stops tunnel)
- VSCode: stop Live Server (or quit)

## Notes:
- The tunnel URL changes every time — always use the fresh one
- The PORT can change (5500 or 5501) — always check the address bar
- Start Live Server BEFORE cloudflared
- cloudflared lives in ~/Documents/
- If localhost shows the WRONG files (like Python files), the wrong
  FOLDER is open in VSCode — File → Open Folder → my camera app


  ## To push an update:
git add .
git commit -m "what I changed"
git push
(Vercel auto-deploys in ~30 sec)