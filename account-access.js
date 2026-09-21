'use strict';
(async () => {
  const title=document.getElementById('title'),status=document.getElementById('status'),form=document.getElementById('password-form'),done=document.getElementById('done');
  const fragment=new URLSearchParams(location.hash.slice(1));
  const linkType=fragment.get('type');
  const accessToken=fragment.get('access_token'),refreshToken=fragment.get('refresh_token');
  const linkError=fragment.get('error_description');
  history.replaceState(null,'',location.pathname);
  try {
    if(linkError)throw Error('This account link has expired or is invalid. Request a new link.');
    if(!['recovery','signup','email_change'].includes(linkType)||!accessToken||!refreshToken)throw Error('Open the latest confirmation or recovery link from your email.');
    const response=await fetch('/api/runtime-config',{cache:'no-store'});
    if(!response.ok)throw Error('Account access service is unavailable. Try again shortly.');
    const {data:configuration}=await response.json();
    const client=window.supabase.createClient(configuration.supabaseUrl,configuration.supabaseAnonKey,{auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:false}});
    const {error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
    if(error)throw Error('This account link has expired. Request a new link.');
    if(linkType!=='recovery') {title.textContent='Email confirmed';status.textContent='Your email address has been verified.';done.hidden=false;await client.auth.signOut({scope:'local'});return;}
    title.textContent='Set your new password';status.textContent='Use at least 12 characters and a password you do not use elsewhere.';form.hidden=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=document.getElementById('submit');if(button.disabled)return;
      const password=document.getElementById('password').value;
      if(password.length<12||password!==document.getElementById('confirm').value){status.textContent='Enter matching passwords of at least 12 characters.';return;}
      button.disabled=true;
      try {const {error}=await client.auth.updateUser({password});if(error)throw error;await client.auth.signOut({scope:'global'});form.reset();form.hidden=true;title.textContent='Password updated';status.textContent='Sign in again using your new password.';done.hidden=false;}
      catch(error){status.textContent=error.message||'Could not update the password. Request a new link and try again.';}
      finally{button.disabled=false;}
    });
  }catch(error){title.textContent='Account link unavailable';status.textContent=error.message;}
})();
