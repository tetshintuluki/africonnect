import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  Home, 
  Briefcase, 
  ShoppingBag, 
  Users, 
  MessageSquare, 
  Bell, 
  User, 
  LogOut, 
  PlusCircle, 
  Search,
  ShieldCheck,
  Menu,
  X,
  Send,
  Image as ImageIcon,
  MoreVertical,
  ThumbsUp,
  Share2,
  Filter,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  where,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout, signUpWithEmail, loginWithEmail } from './firebase';
import { UserProfile, BusinessProfile, Post, JobListing, AdListing, Message, Application } from './types';
import { formatDistanceToNow } from 'date-fns';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const info = JSON.parse(this.state.errorInfo);
        if (info.error.includes('insufficient permissions')) {
          message = "You don't have permission to view this data. Please make sure you are logged in with the correct account.";
        }
      } catch (e) {
        // Not JSON
      }
      return (
        <div className="p-8 text-center h-screen flex flex-col items-center justify-center bg-gray-50">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied or Error</h2>
          <p className="text-gray-600 mb-6 max-w-md">{message}</p>
          <Button onClick={() => window.location.reload()}>Reload Application</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Contexts ---
const AuthContext = createContext<{
  user: FirebaseUser | null;
  profile: UserProfile | BusinessProfile | null;
  loading: boolean;
  isAdmin: boolean;
}>({ user: null, profile: null, loading: true, isAdmin: false });

const useAuth = () => useContext(AuthContext);

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    outline: 'border border-blue-600 text-blue-600 hover:bg-blue-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-gray-600 hover:bg-gray-100'
  };
  return (
    <button 
      type={type}
      disabled={disabled}
      onClick={onClick} 
      className={`px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: any) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <input 
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
      {...props} 
    />
  </div>
);

const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[200]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={() => { onConfirm(); onClose(); }}>Confirm</Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Try to fetch individual profile first
        let docRef = doc(db, 'users', u.uid);
        let docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Try business profile
          docRef = doc(db, 'businesses', u.uid);
          docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as BusinessProfile);
          } else {
            setShowProfileSetup(true);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const isAdmin = (profile as any)?.email === 'kinofelsen@gmail.com' || (profile as any)?.email === 'tetshicliffordntuluki@yahoo.com' || (profile as any)?.role === 'admin';

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (showProfileSetup) {
    return <ProfileSetup onComplete={() => setShowProfileSetup(false)} />;
  }

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={{ user, profile, loading, isAdmin }}>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
          
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Profile Summary */}
            <div className="hidden lg:block lg:col-span-3">
              <ProfileSidebar />
            </div>

            {/* Main Content */}
            <div className="lg:col-span-6 space-y-6">
              <ProfileCompletionBanner onEdit={() => setShowEditProfile(true)} />
              <AnimatePresence mode="wait">
                {activeTab === 'home' && <HomeFeed key="home" />}
                {activeTab === 'jobs' && <JobMarket key="jobs" />}
                {activeTab === 'marketplace' && <BusinessMarketplace key="marketplace" />}
                {activeTab === 'directory' && <IndustryDirectory key="directory" setActiveTab={setActiveTab} />}
                {activeTab === 'messages' && <MessagingSystem key="messages" />}
                {activeTab === 'admin' && isAdmin && <AdminPanel key="admin" />}
              </AnimatePresence>
            </div>

            {/* Right Sidebar - Suggestions/Ads */}
            <div className="hidden lg:block lg:col-span-3 space-y-6">
              <RightSidebar />
            </div>
          </main>

          {/* Modals */}
          {showEditProfile && <EditProfileModal onClose={() => setShowEditProfile(false)} />}

          {/* Mobile Navigation */}
          <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}

// --- Screens & Sub-components ---

function LoginScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        await signUpWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-white p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Briefcase size={32} />
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Africonect</h1>
          <p className="mt-2 text-gray-600">Business & Industry Network</p>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
          <Input 
            label="Email Address" 
            type="email" 
            required 
            value={email} 
            onChange={(e: any) => setEmail(e.target.value)} 
          />
          <Input 
            label="Password" 
            type="password" 
            required 
            value={password} 
            onChange={(e: any) => setPassword(e.target.value)} 
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <Button type="submit" className="w-full py-3">
            {isRegistering ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
          <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or continue with</span></div>
        </div>

        <div className="space-y-4">
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Google
          </button>
          
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-sm text-blue-600 font-medium hover:underline"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>

          <p className="text-xs text-gray-500 px-8">
            By continuing, you agree to Africonect's Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileSetup({ onComplete }: { onComplete: () => void }) {
  const user = auth.currentUser;
  const [type, setType] = useState<'individual' | 'business'>('individual');
  const [formData, setFormData] = useState<any>({});
  const [step, setStep] = useState(1);

  const handleSave = async () => {
    if (!user) return;
    const collectionName = type === 'individual' ? 'users' : 'businesses';
    const data = {
      ...formData,
      uid: user.uid,
      email: user.email,
      role: type,
      createdAt: new Date().toISOString(),
      ...(type === 'business' ? { isApproved: false } : {})
    };
    
    await setDoc(doc(db, collectionName, user.uid), data);
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-xl w-full p-8">
        <h2 className="text-2xl font-bold mb-6">Complete Your Profile</h2>
        
        {step === 1 && (
          <div className="space-y-6">
            <p className="text-gray-600">Choose your account type to get started.</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setType('individual')}
                className={`p-6 rounded-xl border-2 transition-all text-left ${type === 'individual' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
              >
                <User className={`mb-3 ${type === 'individual' ? 'text-blue-600' : 'text-gray-400'}`} size={32} />
                <div className="font-bold">Individual</div>
                <div className="text-sm text-gray-500">For professionals and job seekers</div>
              </button>
              <button 
                onClick={() => setType('business')}
                className={`p-6 rounded-xl border-2 transition-all text-left ${type === 'business' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
              >
                <Briefcase className={`mb-3 ${type === 'business' ? 'text-blue-600' : 'text-gray-400'}`} size={32} />
                <div className="font-bold">Business</div>
                <div className="text-sm text-gray-500">For companies and organizations</div>
              </button>
            </div>
            <Button onClick={() => setStep(2)} className="w-full py-3">Next</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {type === 'individual' ? (
              <>
                <Input label="Full Name" value={formData.name || ''} onChange={(e: any) => setFormData({...formData, name: e.target.value})} />
                <Input label="Profession" value={formData.profession || ''} onChange={(e: any) => setFormData({...formData, profession: e.target.value})} />
                <Input label="Location" value={formData.location || ''} onChange={(e: any) => setFormData({...formData, location: e.target.value})} />
                <Input label="Skills (comma separated)" value={formData.skills || ''} onChange={(e: any) => setFormData({...formData, skills: e.target.value})} />
              </>
            ) : (
              <>
                <Input label="Company Name" value={formData.companyName || ''} onChange={(e: any) => setFormData({...formData, companyName: e.target.value})} />
                <Input label="Industry" value={formData.industry || ''} onChange={(e: any) => setFormData({...formData, industry: e.target.value})} />
                <Input label="Location" value={formData.location || ''} onChange={(e: any) => setFormData({...formData, location: e.target.value})} />
                <Input label="Website" value={formData.website || ''} onChange={(e: any) => setFormData({...formData, website: e.target.value})} />
              </>
            )}
            <div className="flex gap-4 pt-4">
              <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button onClick={handleSave} className="flex-1">Complete Setup</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Navbar({ activeTab, setActiveTab }: any) {
  const { profile, isAdmin } = useAuth();
  
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag },
    { id: 'directory', label: 'Network', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Briefcase size={18} />
            </div>
            <span className="text-xl font-bold text-blue-600 hidden sm:block">Africonect</span>
          </div>
          
          <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-1.5 w-64">
            <Search size={18} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="bg-transparent border-none outline-none px-2 text-sm w-full"
            />
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center px-4 py-1 transition-all relative ${activeTab === item.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <item.icon size={22} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              {activeTab === item.id && (
                <motion.div layoutId="nav-underline" className="absolute bottom-[-14px] left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center px-4 py-1 transition-all relative ${activeTab === 'admin' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <ShieldCheck size={22} />
              <span className="text-[10px] mt-1 font-medium">Admin</span>
              {activeTab === 'admin' && (
                <motion.div layoutId="nav-underline" className="absolute bottom-[-14px] left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button className="text-gray-500 hover:text-gray-900 relative">
            <Bell size={22} />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">3</span>
          </button>
          <div className="h-8 w-px bg-gray-200 mx-1" />
          <button onClick={logout} className="text-gray-500 hover:text-red-600 flex items-center gap-2">
            <LogOut size={20} />
            <span className="text-sm font-medium hidden sm:block">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function MobileNav({ activeTab, setActiveTab }: any) {
  const { isAdmin } = useAuth();
  const navItems = [
    { id: 'home', icon: Home },
    { id: 'jobs', icon: Briefcase },
    { id: 'marketplace', icon: ShoppingBag },
    { id: 'messages', icon: MessageSquare },
    { id: 'directory', icon: Users },
  ];

  return (
    <div className="md:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 h-16 flex items-center justify-around px-2 z-50">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className={`p-2 rounded-lg transition-all ${activeTab === item.id ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
        >
          <item.icon size={24} />
        </button>
      ))}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('admin')}
          className={`p-2 rounded-lg transition-all ${activeTab === 'admin' ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
        >
          <ShieldCheck size={24} />
        </button>
      )}
    </div>
  );
}

function ProfileSidebar() {
  const { profile, user } = useAuth();
  if (!profile) return null;

  const isBusiness = profile.role === 'business';

  return (
    <Card className="sticky top-24">
      <div className="h-16 bg-blue-600" />
      <div className="px-4 pb-4 -mt-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-xl border-4 border-white bg-white overflow-hidden shadow-sm mb-3">
          <img 
            src={isBusiness ? (profile as BusinessProfile).logo || `https://picsum.photos/seed/${profile.uid}/200` : (profile as UserProfile).profilePhoto || `https://picsum.photos/seed/${profile.uid}/200`} 
            alt="Profile" 
            className="w-full h-full object-cover"
          />
        </div>
        <h3 className="font-bold text-gray-900">{isBusiness ? (profile as BusinessProfile).companyName : profile.name}</h3>
        <p className="text-xs text-gray-500 mt-1">{isBusiness ? (profile as BusinessProfile).industry : (profile as UserProfile).profession || 'Professional'}</p>
        
        <div className="w-full border-t border-gray-100 mt-4 pt-4 space-y-3 text-left">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Profile views</span>
            <span className="text-blue-600 font-bold">124</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Post impressions</span>
            <span className="text-blue-600 font-bold">842</span>
          </div>
        </div>

        <div className="w-full border-t border-gray-100 mt-4 pt-4">
          <button className="text-xs font-bold text-blue-600 hover:underline">View full profile</button>
        </div>
      </div>
    </Card>
  );
}

function RightSidebar() {
  return (
    <div className="space-y-6 sticky top-24">
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-4 flex items-center justify-between">
          Trending Industry News
          <MoreVertical size={14} className="text-gray-400" />
        </h3>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="group cursor-pointer">
              <h4 className="text-xs font-bold group-hover:text-blue-600 transition-all">Tech Industry Growth in 2026</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">2d ago • 4,231 readers</p>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 text-xs font-bold text-gray-500 hover:bg-gray-50 py-2 rounded-lg transition-all">Show more</button>
      </Card>

      <Card className="p-4 bg-blue-50 border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={18} className="text-blue-600" />
          <h3 className="font-bold text-sm text-blue-900">Premium Ads</h3>
        </div>
        <div className="rounded-lg overflow-hidden mb-3">
          <img src="https://picsum.photos/seed/ads/400/250" alt="Ad" className="w-full h-32 object-cover" />
        </div>
        <h4 className="text-xs font-bold text-blue-900">Triple K Empire - Design Services</h4>
        <p className="text-[10px] text-blue-700 mt-1">Get 20% off on your first business branding package.</p>
        <Button className="w-full mt-3 py-1.5 text-xs">Learn More</Button>
      </Card>
    </div>
  );
}

// --- Feed Components ---

function HomeFeed() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });
    return unsubscribe;
  }, []);

  const handlePost = async () => {
    if (!newPost.trim() || !profile) return;
    
    const isBusiness = profile.role === 'business';
    const authorName = isBusiness ? (profile as BusinessProfile).companyName : profile.name;
    const authorPhoto = isBusiness ? (profile as BusinessProfile).logo : (profile as UserProfile).profilePhoto;

    await addDoc(collection(db, 'posts'), {
      authorId: profile.uid,
      authorName,
      authorPhoto: authorPhoto || '',
      authorRole: isBusiness ? (profile as BusinessProfile).industry : (profile as UserProfile).profession || 'Professional',
      content: newPost,
      createdAt: new Date().toISOString()
    });
    setNewPost('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <Card className="p-4">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
            <img src={`https://picsum.photos/seed/${profile?.uid}/100`} alt="Me" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <textarea 
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="Start a post..."
              className="w-full bg-gray-100 border-none rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none h-24"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-2">
                <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-2 text-xs font-medium">
                  <ImageIcon size={18} className="text-blue-500" /> Photo
                </button>
                <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-2 text-xs font-medium">
                  <PlusCircle size={18} className="text-green-500" /> Event
                </button>
              </div>
              <Button onClick={handlePost} disabled={!newPost.trim()}>Post</Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </motion.div>
  );
}

function PostCard({ post }: { post: Post }) {
  const { isAdmin } = useAuth();
  
  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      await deleteDoc(doc(db, 'posts', post.id));
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden">
            <img src={post.authorPhoto || `https://picsum.photos/seed/${post.authorId}/100`} alt={post.authorName} className="w-full h-full object-cover" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900 hover:text-blue-600 cursor-pointer">{post.authorName}</h4>
            <p className="text-[10px] text-gray-500">{post.authorRole}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatDistanceToNow(new Date(post.createdAt))} ago</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={handleDelete} className="text-red-400 hover:text-red-600 p-1">
              <Trash2 size={18} />
            </button>
          )}
          <button className="text-gray-400 hover:text-gray-600 p-1">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>
      
      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-4">
        {post.content}
      </div>

      {post.imageUrl && (
        <div className="rounded-xl overflow-hidden mb-4 border border-gray-100">
          <img src={post.imageUrl} alt="Post" className="w-full max-h-96 object-cover" />
        </div>
      )}

      <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
        <button className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-blue-600 transition-all">
          <ThumbsUp size={18} /> Like
        </button>
        <button className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-blue-600 transition-all">
          <MessageSquare size={18} /> Comment
        </button>
        <button className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-blue-600 transition-all">
          <Share2 size={18} /> Share
        </button>
      </div>
    </Card>
  );
}

// --- Job Market ---

function JobMarket() {
  const { profile, isAdmin } = useAuth();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [showAddJob, setShowAddJob] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobListing)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });
    return unsubscribe;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Job Market</h2>
        {(profile?.role === 'business' || isAdmin) && (
          <Button onClick={() => setShowAddJob(true)} className="flex items-center gap-2">
            <PlusCircle size={18} /> Post Job
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['All Jobs', 'Remote', 'Full-time', 'Internship', 'Contract'].map((filter) => (
          <button key={filter} className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 whitespace-nowrap hover:border-blue-600 hover:text-blue-600 transition-all">
            {filter}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {showAddJob && <AddJobModal onClose={() => setShowAddJob(false)} />}
    </motion.div>
  );
}

function JobCard({ job }: { job: JobListing }) {
  const { profile, isAdmin } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  
  const handleApply = async () => {
    if (!profile) return;
    await addDoc(collection(db, 'applications'), {
      jobId: job.id,
      applicantId: profile.uid,
      companyId: job.companyId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    alert('Application sent successfully!');
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this job listing?')) {
      await deleteDoc(doc(db, 'jobs', job.id));
    }
  };

  return (
    <>
      <Card className="p-5 hover:border-blue-300 transition-all group">
        <div className="flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-100">
            <img src={job.companyLogo || `https://picsum.photos/seed/${job.companyId}/100`} alt={job.companyName} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div className="cursor-pointer" onClick={() => setShowDetails(true)}>
                <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-all">{job.title}</h3>
                <p className="text-sm text-blue-600 font-medium">{job.companyName}</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={handleDelete} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={16} />
                  </button>
                )}
                <span className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded uppercase tracking-wider">
                  {job.type}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Users size={14} /> {job.location}</span>
              <span className="flex items-center gap-1"><ShoppingBag size={14} /> {job.salary || 'Negotiable'}</span>
            </div>

            <p className="text-sm text-gray-600 mt-4 line-clamp-2">{job.description}</p>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleApply} className="flex-1">Apply Now</Button>
              <Button variant="secondary" className="px-3" onClick={() => setShowDetails(true)}><PlusCircle size={18} /></Button>
            </div>
          </div>
        </div>
      </Card>

      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110]">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <img src={job.companyLogo || `https://picsum.photos/seed/${job.companyId}/100`} alt={job.companyName} className="w-12 h-12 rounded-lg object-cover" />
                <div>
                  <h2 className="text-xl font-bold">{job.title}</h2>
                  <p className="text-sm text-blue-600 font-medium">{job.companyName}</p>
                </div>
              </div>
              <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="space-y-6">
              <div className="flex gap-4 text-sm text-gray-500">
                <span className="bg-gray-100 px-3 py-1 rounded-full">{job.type}</span>
                <span className="bg-gray-100 px-3 py-1 rounded-full">{job.location}</span>
                <span className="bg-gray-100 px-3 py-1 rounded-full">{job.salary || 'Negotiable'}</span>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 mb-2">Job Description</h4>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description}</p>
              </div>

              {job.requirements && (
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Requirements</h4>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{job.requirements}</p>
                </div>
              )}

              <div className="pt-6 border-t border-gray-100">
                <Button onClick={() => { handleApply(); setShowDetails(false); }} className="w-full py-3">Apply for this position</Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

function AddJobModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState<any>({ type: 'full-time' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    await addDoc(collection(db, 'jobs'), {
      ...formData,
      companyId: profile.uid,
      companyName: (profile as BusinessProfile).companyName || (profile as any).name,
      companyLogo: (profile as BusinessProfile).logo || '',
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Post a New Job</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Job Title" required onChange={(e: any) => setFormData({...formData, title: e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Location" required onChange={(e: any) => setFormData({...formData, location: e.target.value})} />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
              <select 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none"
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
          </div>
          <Input label="Salary (Optional)" onChange={(e: any) => setFormData({...formData, salary: e.target.value})} />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label>
            <textarea 
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none h-20"
              placeholder="List key requirements..."
              onChange={(e) => setFormData({...formData, requirements: e.target.value})}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea 
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none h-32"
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <Button type="submit" className="w-full py-3">Post Vacancy</Button>
        </form>
      </motion.div>
    </div>
  );
}

// --- Marketplace ---

function BusinessMarketplace() {
  const { profile, isAdmin } = useAuth();
  const [ads, setAds] = useState<AdListing[]>([]);
  const [showAddAd, setShowAddAd] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'ads'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdListing)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ads');
    });
    return unsubscribe;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Business Marketplace</h2>
        {(profile?.role === 'business' || isAdmin) && (
          <Button onClick={() => setShowAddAd(true)} className="flex items-center gap-2">
            <PlusCircle size={18} /> Create Ad
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} />
        ))}
      </div>

      {showAddAd && <AddAdModal onClose={() => setShowAddAd(false)} />}
    </motion.div>
  );
}

function AdCard({ ad }: { ad: AdListing }) {
  const { isAdmin } = useAuth();

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this advertisement?')) {
      await deleteDoc(doc(db, 'ads', ad.id));
    }
  };

  return (
    <Card className="group cursor-pointer hover:shadow-md transition-all">
      <div className="relative h-48 overflow-hidden">
        <img src={ad.imageUrl || `https://picsum.photos/seed/${ad.id}/600/400`} alt={ad.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
        <div className="absolute top-3 right-3">
          {isAdmin && (
            <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="p-2 bg-white/80 hover:bg-white text-red-600 rounded-full shadow-sm transition-all">
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded uppercase tracking-wider shadow-sm">
            {ad.adType}
          </span>
          {ad.isSponsored && (
            <span className="px-2 py-1 bg-amber-500 text-white text-[10px] font-bold rounded uppercase tracking-wider shadow-sm">
              Sponsored
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-all">{ad.title}</h3>
        <p className="text-xs text-blue-600 font-medium mt-1">{ad.businessName}</p>
        <p className="text-xs text-gray-600 mt-3 line-clamp-2">{ad.description}</p>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1 py-2 text-xs">Contact Business</Button>
          <Button variant="secondary" className="px-3"><Share2 size={16} /></Button>
        </div>
      </div>
    </Card>
  );
}

function AddAdModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState<any>({ adType: 'product' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    await addDoc(collection(db, 'ads'), {
      ...formData,
      businessId: profile.uid,
      businessName: (profile as BusinessProfile).companyName || (profile as any).name,
      createdAt: new Date().toISOString(),
      isSponsored: false
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Create Advertisement</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Ad Title" required onChange={(e: any) => setFormData({...formData, title: e.target.value})} />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad Type</label>
            <select 
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none"
              onChange={(e) => setFormData({...formData, adType: e.target.value})}
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
              <option value="recruitment">Recruitment</option>
              <option value="event">Event</option>
            </select>
          </div>
          <Input label="Image URL (Optional)" onChange={(e: any) => setFormData({...formData, imageUrl: e.target.value})} />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea 
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none h-32"
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <Button type="submit" className="w-full py-3">Launch Ad</Button>
        </form>
      </motion.div>
    </div>
  );
}

// --- Messaging ---

function MessagingSystem() {
  const { profile } = useAuth();
  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'messages'), 
      where('participants', 'array-contains', profile.uid),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMsgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      const myChats = new Map();
      
      allMsgs.forEach(msg => {
        const otherId = msg.chatId.replace(profile.uid, '').replace('_', '');
        myChats.set(otherId, { id: msg.chatId, otherId, lastMsg: msg });
      });
      
      setChats(Array.from(myChats.values()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });
    return unsubscribe;
  }, [profile]);

  useEffect(() => {
    if (!activeChat) return;
    const q = query(collection(db, 'messages'), where('chatId', '==', activeChat.id), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `messages/${activeChat.id}`);
    });
    return unsubscribe;
  }, [activeChat]);

  const handleSend = async () => {
    if (!newMessage.trim() || !profile || !activeChat) return;
    const otherId = activeChat.otherId;
    await addDoc(collection(db, 'messages'), {
      chatId: activeChat.id,
      senderId: profile.uid,
      participants: [profile.uid, otherId],
      text: newMessage,
      createdAt: new Date().toISOString()
    });
    setNewMessage('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[calc(100vh-180px)] bg-white rounded-2xl border border-gray-200 shadow-sm flex overflow-hidden"
    >
      {/* Chat List */}
      <div className={`w-full md:w-80 border-r border-gray-200 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-bold text-lg">Chats</h2>
          <div className="mt-3 bg-white rounded-lg px-3 py-1.5 flex items-center gap-2 border border-gray-200">
            <Search size={16} className="text-gray-400" />
            <input type="text" placeholder="Search or start new chat" className="bg-transparent border-none outline-none text-sm w-full" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No conversations yet.</div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={`p-4 flex gap-3 cursor-pointer hover:bg-gray-50 transition-all border-b border-gray-100 ${activeChat?.id === chat.id ? 'bg-gray-100' : ''}`}
              >
                <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden border border-gray-200">
                  <img src={`https://picsum.photos/seed/${chat.otherId}/100`} alt="User" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm truncate">User {chat.otherId.slice(0, 5)}</h4>
                    <span className="text-[10px] text-gray-400">2h</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{chat.lastMsg.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`flex-1 flex flex-col bg-[#e5ddd5] ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        {activeChat ? (
          <>
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveChat(null)} className="md:hidden p-2 -ml-2 text-gray-500"><X size={20} /></button>
                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-200">
                  <img src={`https://picsum.photos/seed/${activeChat.otherId}/100`} alt="User" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">User {activeChat.otherId.slice(0, 5)}</h4>
                  <p className="text-[10px] text-green-500 font-medium">Online</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-gray-400 hover:text-gray-600"><MoreVertical size={20} /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderId === profile?.uid ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-2 px-3 rounded-lg text-sm shadow-sm relative ${msg.senderId === profile?.uid ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}`}>
                    {msg.text}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-gray-500">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.senderId === profile?.uid && <ShieldCheck size={10} className="text-blue-400" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-[#f0f0f0] flex items-center gap-2">
              <button className="p-2 text-gray-500 hover:text-gray-700"><PlusCircle size={22} /></button>
              <div className="flex-1 bg-white rounded-full px-4 py-2 shadow-sm">
                <input 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  type="text" 
                  placeholder="Type a message" 
                  className="w-full bg-transparent border-none outline-none text-sm" 
                />
              </div>
              <button onClick={handleSend} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all shadow-md">
                <Send size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6">
              <MessageSquare size={48} />
            </div>
            <h3 className="font-bold text-xl text-gray-900">Africonect Web</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-xs">Send and receive messages without keeping your phone online. Use Africonect on up to 4 linked devices and 1 phone at the same time.</p>
            <div className="mt-12 flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck size={14} /> End-to-end encrypted
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Directory ---

function IndustryDirectory({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { profile } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const [view, setView] = useState<'businesses' | 'professionals'>('businesses');
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessProfile | null>(null);
  const [confirmFollow, setConfirmFollow] = useState<{ isOpen: boolean, businessId: string | null }>({ isOpen: false, businessId: null });

  useEffect(() => {
    const qB = query(collection(db, 'businesses'), orderBy('createdAt', 'desc'));
    const unsubB = onSnapshot(qB, (snapshot) => {
      setBusinesses(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as BusinessProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'businesses');
    });

    const qP = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubP = onSnapshot(qP, (snapshot) => {
      setProfessionals(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => { unsubB(); unsubP(); };
  }, []);

  const handleFollow = async (businessId: string) => {
    if (!profile || profile.role !== 'individual') return;
    const currentFollowing = (profile as UserProfile).following || [];
    const isFollowing = currentFollowing.includes(businessId);
    
    // If not following, show confirmation
    if (!isFollowing) {
      setConfirmFollow({ isOpen: true, businessId });
      return;
    }

    // If already following, just unfollow directly
    const newFollowing = currentFollowing.filter(id => id !== businessId);
    await updateDoc(doc(db, 'users', profile.uid), { following: newFollowing });
  };

  const executeFollow = async () => {
    if (!profile || !confirmFollow.businessId) return;
    const currentFollowing = (profile as UserProfile).following || [];
    const newFollowing = [...currentFollowing, confirmFollow.businessId];
    await updateDoc(doc(db, 'users', profile.uid), { following: newFollowing });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <ConfirmationModal 
        isOpen={confirmFollow.isOpen}
        onClose={() => setConfirmFollow({ isOpen: false, businessId: null })}
        onConfirm={executeFollow}
        title="Follow Company"
        message="Are you sure you want to follow this company?"
      />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Industry Directory</h2>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setView('businesses')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'businesses' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            Businesses
          </button>
          <button 
            onClick={() => setView('professionals')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'professionals' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            Professionals
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {view === 'businesses' ? (
          businesses.map(b => (
            <Card key={b.uid} className="p-4 flex gap-4 items-center cursor-pointer hover:bg-gray-50 transition-all" onClick={() => setSelectedBusiness(b)}>
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden border border-gray-100">
                <img src={b.logo || `https://picsum.photos/seed/${b.uid}/100`} alt={b.companyName} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <h4 className="font-bold text-gray-900 truncate">{b.companyName}</h4>
                  {b.isApproved && <ShieldCheck size={14} className="text-blue-600" />}
                </div>
                <p className="text-xs text-blue-600 font-medium">{b.industry}</p>
                <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1"><Users size={12} /> {b.location}</p>
              </div>
              {profile?.role === 'individual' && (
                <Button 
                  variant={(profile as UserProfile).following?.includes(b.uid) ? 'secondary' : 'outline'} 
                  className="py-1.5 text-xs"
                  onClick={(e: any) => { e.stopPropagation(); handleFollow(b.uid); }}
                >
                  {(profile as UserProfile).following?.includes(b.uid) ? 'Following' : 'Follow'}
                </Button>
              )}
            </Card>
          ))
        ) : (
          professionals.map(p => (
            <Card key={p.uid} className="p-4 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden border border-gray-100">
                <img src={p.profilePhoto || `https://picsum.photos/seed/${p.uid}/100`} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 truncate">{(p as any).name}</h4>
                <p className="text-xs text-blue-600 font-medium">{p.profession || 'Professional'}</p>
                <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1"><Users size={12} /> {p.location || 'Global'}</p>
              </div>
              <Button variant="outline" className="py-1.5 text-xs">Connect</Button>
            </Card>
          ))
        )}
      </div>

      {selectedBusiness && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="h-32 bg-blue-600 relative">
              <button onClick={() => setSelectedBusiness(null)} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all"><X size={20} /></button>
            </div>
            <div className="px-8 pb-8 -mt-12">
              <div className="flex justify-between items-end mb-6">
                <div className="w-24 h-24 rounded-2xl border-4 border-white bg-white overflow-hidden shadow-md">
                  <img src={selectedBusiness.logo || `https://picsum.photos/seed/${selectedBusiness.uid}/200`} alt="Logo" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-3">
                  {profile?.role === 'individual' && (
                    <Button 
                      variant={(profile as UserProfile).following?.includes(selectedBusiness.uid) ? 'secondary' : 'primary'}
                      onClick={() => handleFollow(selectedBusiness.uid)}
                    >
                      {(profile as UserProfile).following?.includes(selectedBusiness.uid) ? 'Following' : 'Follow'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { setActiveTab('messages'); setSelectedBusiness(null); }}>Message</Button>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">{selectedBusiness.companyName}</h2>
                {selectedBusiness.isApproved && <ShieldCheck size={20} className="text-blue-600" />}
              </div>
              <p className="text-blue-600 font-medium">{selectedBusiness.industry}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Users size={16} /> {selectedBusiness.location}</span>
                <span className="flex items-center gap-1"><ShoppingBag size={16} /> {selectedBusiness.employees || '0-10'} employees</span>
              </div>

              <div className="mt-8 space-y-6">
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">About</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedBusiness.description || 'No description provided.'}</p>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Services</h3>
                    <p className="text-sm text-gray-600">{selectedBusiness.services || 'Not listed'}</p>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Products</h3>
                    <p className="text-sm text-gray-600">{selectedBusiness.products || 'Not listed'}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

// --- Admin Panel ---

function ProfileCompletionBanner({ onEdit }: { onEdit: () => void }) {
  const { profile, loading } = useAuth();
  if (loading || !profile) return null;

  const isIndividual = profile.role === 'individual';
  const isIncomplete = isIndividual 
    ? !(profile as UserProfile).profession || !(profile as UserProfile).skills
    : !(profile as BusinessProfile).description || !(profile as BusinessProfile).logo;

  if (!isIncomplete) return null;

  return (
    <Card className="bg-amber-50 border-amber-200 p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
          <Bell size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-900">Complete your profile</h4>
          <p className="text-xs text-amber-700">Add your {isIndividual ? 'profession and skills' : 'company description and logo'} to get 5x more visibility.</p>
        </div>
      </div>
      <Button variant="outline" className="border-amber-600 text-amber-600 hover:bg-amber-100 text-xs py-1.5" onClick={onEdit}>Edit Profile</Button>
    </Card>
  );
}

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState<any>(profile || {});

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const collectionName = profile.role === 'individual' ? 'users' : 'businesses';
    await updateDoc(doc(db, collectionName, profile.uid), formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[120]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Edit Profile</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          {profile?.role === 'individual' ? (
            <>
              <Input label="Full Name" value={formData.name || ''} onChange={(e: any) => setFormData({...formData, name: e.target.value})} />
              <Input label="Profession" value={formData.profession || ''} onChange={(e: any) => setFormData({...formData, profession: e.target.value})} />
              <Input label="Location" value={formData.location || ''} onChange={(e: any) => setFormData({...formData, location: e.target.value})} />
              <Input label="Skills" value={formData.skills || ''} onChange={(e: any) => setFormData({...formData, skills: e.target.value})} />
              <Input label="Experience" value={formData.experience || ''} onChange={(e: any) => setFormData({...formData, experience: e.target.value})} />
              <Input label="Profile Photo URL" value={formData.profilePhoto || ''} onChange={(e: any) => setFormData({...formData, profilePhoto: e.target.value})} />
            </>
          ) : (
            <>
              <Input label="Company Name" value={formData.companyName || ''} onChange={(e: any) => setFormData({...formData, companyName: e.target.value})} />
              <Input label="Industry" value={formData.industry || ''} onChange={(e: any) => setFormData({...formData, industry: e.target.value})} />
              <Input label="Location" value={formData.location || ''} onChange={(e: any) => setFormData({...formData, location: e.target.value})} />
              <Input label="Website" value={formData.website || ''} onChange={(e: any) => setFormData({...formData, website: e.target.value})} />
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Description</label>
                <textarea 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none h-32"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <Input label="Logo URL" value={formData.logo || ''} onChange={(e: any) => setFormData({...formData, logo: e.target.value})} />
            </>
          )}
          <Button type="submit" className="w-full py-3">Save Changes</Button>
        </form>
      </motion.div>
    </div>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, businesses: 0, jobs: 0, ads: 0 });

  useEffect(() => {
    onSnapshot(collection(db, 'users'), s => {
      setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setStats(prev => ({ ...prev, users: s.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    onSnapshot(collection(db, 'businesses'), s => {
      setBusinesses(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setStats(prev => ({ ...prev, businesses: s.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'businesses');
    });
    onSnapshot(collection(db, 'jobs'), s => setStats(prev => ({ ...prev, jobs: s.size })), (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });
    onSnapshot(collection(db, 'ads'), s => setStats(prev => ({ ...prev, ads: s.size })), (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ads');
    });
  }, []);

  const handleDelete = async (coll: string, id: string) => {
    if (window.confirm('Are you sure you want to delete this?')) {
      await deleteDoc(doc(db, coll, id));
    }
  };

  const handleVerify = async (id: string, status: boolean) => {
    await updateDoc(doc(db, 'businesses', id), { isApproved: status });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(stats).map(([label, value]) => (
          <Card key={label} className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{value}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mt-1">{label}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-sm">Manage Users & Businesses</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold border-b border-gray-200">
                <th className="px-4 py-3">Name/Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">Individual</span></td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete('users', u.id)} className="text-red-500 hover:text-red-700 font-bold text-xs">Delete</button>
                  </td>
                </tr>
              ))}
              {businesses.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{b.companyName}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-bold">Business</span></td>
                  <td className="px-4 py-3">
                    {b.isApproved ? (
                      <span className="text-green-600 text-xs font-bold flex items-center gap-1"><ShieldCheck size={14} /> Verified</span>
                    ) : (
                      <button onClick={() => handleVerify(b.id, true)} className="text-blue-600 hover:underline text-xs font-bold">Approve</button>
                    )}
                  </td>
                  <td className="px-4 py-3 flex gap-3">
                    {b.isApproved && <button onClick={() => handleVerify(b.id, false)} className="text-amber-600 hover:underline text-xs font-bold">Revoke</button>}
                    <button onClick={() => handleDelete('businesses', b.id)} className="text-red-500 hover:text-red-700 font-bold text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
