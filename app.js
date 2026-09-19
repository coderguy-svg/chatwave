// Paste your Supabase project values here.
const SUPABASE_URL = "https://jtrkaltfmzpkfzqvctdl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cmthbHRmbXpwa2Z6cXZjdGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NzAwOTEsImV4cCI6MjEwNTM0NjA5MX0";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null, selectedUser = null, channel = null;

const $ = id => document.getElementById(id);
const show = (id, yes) => $(id).classList.toggle("hidden", !yes);
const setMessage = text => $("authMessage").textContent = text;

async function init(){
  if(SUPABASE_URL.startsWith("YOUR_")) {
    setMessage("Open app.js and add your Supabase URL and anon key.");
    return;
  }
  const {data:{session}} = await db.auth.getSession();
  if(session) await enterApp(session.user);
  db.auth.onAuthStateChange(async (_event, session) => {
    if(session) await enterApp(session.user); else leaveApp();
  });
}
async function enterApp(user){
  currentUser=user; show("authView",false); show("chatView",true);
  $("userLabel").textContent=`Signed in as ${user.email}`;
  await loadUsers();
}
function leaveApp(){currentUser=null;show("authView",true);show("chatView",false)}
$("signupBtn").onclick=async()=>{
  const {error}=await db.auth.signUp({email:$("email").value,password:$("password").value});
  setMessage(error?error.message:"Account created. Check your email if confirmation is enabled.");
};
$("loginBtn").onclick=async()=>{
  const {error}=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  setMessage(error?error.message:"");
};
$("logoutBtn").onclick=()=>db.auth.signOut();
$("themeBtn").onclick=()=>document.body.classList.toggle("dark");

async function loadUsers(){
  const {data,error}=await db.from("profiles").select("id,username").neq("id",currentUser.id).order("username");
  if(error){$("usersList").textContent=error.message;return}
  renderUsers(data||[]);
}
function renderUsers(users){
  $("usersList").innerHTML="";
  users.filter(u=>(u.username||"").toLowerCase().includes($("userSearch").value.toLowerCase()))
  .forEach(u=>{
    const el=document.createElement("div");el.className="user"+(selectedUser?.id===u.id?" active":"");
    el.textContent="@"+u.username;el.onclick=()=>selectUser(u);$("usersList").appendChild(el);
  });
}
$("userSearch").oninput=loadUsers;

async function getConversation(otherId){
  const {data,error}=await db.rpc("get_or_create_direct_conversation",{other_user_id:otherId});
  if(error) throw error;
  return data;
}
async function selectUser(user){
  selectedUser=user;$("conversationTitle").textContent="@"+user.username;
  $("status").textContent="";$("messageInput").disabled=false;$("sendBtn").disabled=false;
  document.querySelectorAll(".user").forEach(x=>x.classList.remove("active"));
  await loadMessages();
  if(channel) await db.removeChannel(channel);
  channel=db.channel("messages-"+[currentUser.id,user.id].sort().join("-"))
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
      if([payload.new.sender_id,payload.new.receiver_id].includes(currentUser.id) &&
         [payload.new.sender_id,payload.new.receiver_id].includes(selectedUser.id)) loadMessages();
    }).subscribe();
}
async function loadMessages(){
  if(!selectedUser)return;
  const {data,error}=await db.from("messages").select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`)
    .order("created_at",{ascending:true});
  if(error){$("messages").textContent=error.message;return}
  $("messages").innerHTML="";
  (data||[]).forEach(m=>{
    const wrap=document.createElement("div");wrap.className="bubble"+(m.sender_id===currentUser.id?" mine":"");
    wrap.textContent=m.content;
    const meta=document.createElement("div");meta.className="meta";meta.textContent=new Date(m.created_at).toLocaleString();
    wrap.appendChild(meta);$("messages").appendChild(wrap);
  });
  $("messages").scrollTop=$("messages").scrollHeight;
}
$("messageForm").onsubmit=async e=>{
  e.preventDefault();const content=$("messageInput").value.trim();
  if(!content||!selectedUser)return;
  $("messageInput").value="";
  const {error}=await db.from("messages").insert({sender_id:currentUser.id,receiver_id:selectedUser.id,content});
  if(error){$("status").textContent=error.message;$("messageInput").value=content}
  else await loadMessages();
};
init();
