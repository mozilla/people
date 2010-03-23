#include <CoreFoundation/CFString.h>
#include "INativeAddressCard.h"

class TaggedField 
{
	public:
		TaggedField(const CFStringRef type, const CFStringRef value);
		CFStringRef mType;
		CFStringRef mValue;
};

class AddressField 
{
	public:
		AddressField(const CFStringRef type, const CFStringRef street, const CFStringRef city, const CFStringRef zip, const CFStringRef country, const CFStringRef countryCode);
		CFStringRef mType;
		CFStringRef mStreet;
		CFStringRef mCity;
		CFStringRef mZip;
		CFStringRef mCountry;
		CFStringRef mCountryCode;
};

/* Header file */
class NativeAddressCard : public INativeAddressCard
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_INATIVEADDRESSCARD

  NativeAddressCard();


	void setFirstName(const CFStringRef name);
	void setLastName(const CFStringRef name);
	void setOrganization(const CFStringRef org);
	void setTitle(const CFStringRef title);
	void setEmail(const CFStringRef type, const CFStringRef email);
	void setPhone(const CFStringRef type, const CFStringRef phone);
	void setURL(const CFStringRef type, const CFStringRef url);
	void setAddress(const CFStringRef type, const CFStringRef streetPtr, const CFStringRef cityPtr, 
                  const CFStringRef zipPtr, const CFStringRef countryPtr, const CFStringRef countryCodePtr);
  
private:
  ~NativeAddressCard();

protected:
  /* additional members */
	CFStringRef mFirstName;
	CFStringRef mLastName;
	CFStringRef mOrganization;
	CFStringRef mTitle;
	
	TaggedField **mEmails;
	int mNumEmails, mEmailsSize;

	TaggedField **mPhones;
	int mNumPhones, mPhonesSize;

	TaggedField **mURLs;
	int mNumURLs, mURLsSize;

	AddressField **mAddresses;
	int mNumAddresses, mAddressesSize;
};
