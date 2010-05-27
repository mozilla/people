#include <CoreFoundation/CFString.h>
#include "INativeAddressCard.h"

class TypedElement 
{
  public:
    virtual CFStringRef getType()=0;
    virtual CFStringRef getValue()=0;
};

class TaggedField : public TypedElement
{
	public:
		TaggedField(const CFStringRef type, const CFStringRef value);
    ~TaggedField();
    virtual CFStringRef getType();
    virtual CFStringRef getValue();

  protected:
		CFStringRef mType;
		CFStringRef mValue;
};

class AddressField : public TypedElement
{
	public:
		AddressField(const CFStringRef type, const CFStringRef street, const CFStringRef city, const CFStringRef state, const CFStringRef zip, const CFStringRef country, const CFStringRef countryCode);
    virtual CFStringRef getType();
    virtual CFStringRef getValue();

  protected:
		CFMutableStringRef mLocalJSON;
		CFStringRef mType;
		CFStringRef mStreet;
		CFStringRef mCity;
		CFStringRef mState;
		CFStringRef mZip;
		CFStringRef mCountry;
		CFStringRef mCountryCode;
};

class NativeAddressCard : public INativeAddressCard
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_INATIVEADDRESSCARD

  NativeAddressCard();


	void setFirstName(const CFStringRef name);
	void setLastName(const CFStringRef name);
	void setOrganization(const CFStringRef org);
	void setDepartment(const CFStringRef org);
	void setTitle(const CFStringRef title);
	void setEmail(const CFStringRef type, const CFStringRef email);
	void setPhone(const CFStringRef type, const CFStringRef phone);
	void setURL(const CFStringRef type, const CFStringRef url);
  
  void addGroup(const CFStringRef groupName);

	void setAddress(const CFStringRef type, const CFStringRef streetPtr, const CFStringRef cityPtr, const CFStringRef statePtr, 
                  const CFStringRef zipPtr, const CFStringRef countryPtr, const CFStringRef countryCodePtr);
  
private:
  ~NativeAddressCard();
  void buildGroupJSON();
  
protected:
  /* additional members */
	CFStringRef mFirstName;
	CFStringRef mLastName;
	CFStringRef mOrganization;
	CFStringRef mDepartment;
	CFStringRef mTitle;
  CFMutableArrayRef mGroups;
  CFMutableStringRef mGroupsJSON;
  
	TaggedField **mEmails;
	int mNumEmails, mEmailsSize;

	TaggedField **mPhones;
	int mNumPhones, mPhonesSize;

	TaggedField **mURLs;
	int mNumURLs, mURLsSize;

	AddressField **mAddresses;
	int mNumAddresses, mAddressesSize;
};
