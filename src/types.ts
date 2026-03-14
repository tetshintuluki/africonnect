export type UserRole = 'individual' | 'business' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  location?: string;
  profession?: string;
  education?: string;
  experience?: string;
  skills?: string;
  cvUrl?: string;
  profilePhoto?: string;
  availability?: boolean;
  following?: string[];
  role: UserRole;
  createdAt: string;
}

export interface BusinessProfile {
  uid: string;
  companyName: string;
  industry: string;
  location: string;
  website?: string;
  description?: string;
  logo?: string;
  contact?: string;
  employees?: number;
  services?: string;
  products?: string;
  role: 'business';
  createdAt: string;
  isApproved: boolean;
}

export interface JobListing {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo?: string;
  title: string;
  description: string;
  requirements: string;
  salary?: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'internship';
  createdAt: string;
}

export interface AdListing {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  description: string;
  imageUrl?: string;
  adType: 'product' | 'service' | 'recruitment' | 'event';
  createdAt: string;
  isSponsored: boolean;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  authorRole: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  participants: string[];
  text: string;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  applicantId: string;
  companyId: string;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected';
  createdAt: string;
}
