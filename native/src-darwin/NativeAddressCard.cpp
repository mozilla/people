#include <stdlib.h>
#include <stdio.h>
#include <wchar.h>
#include "NativeAddressCard.h"
#include "nsMemory.h"
#include "nsStringAPI.h"
#include <AddressBook/ABAddressBookC.h>


/* Implementation file */
NS_IMPL_ISUPPORTS1(NativeAddressCard, INativeAddressCard)

NativeAddressCard::NativeAddressCard() 
{
  /* member initializers and constructor code */
	mFirstName = NULL;
	mLastName = NULL;
	mOrganization = NULL;
	mDepartment = NULL;
	mTitle = NULL;
	mEmails = NULL;
	mNumEmails = mEmailsSize = 0;
	mPhones = NULL;
	mNumPhones = mPhonesSize = 0;
	mURLs = NULL;
	mNumURLs = mURLsSize = 0;
}

NativeAddressCard::~NativeAddressCard()
{
  /* destructor code */
	if (mFirstName) CFRelease(mFirstName);
	if (mLastName) CFRelease(mLastName);
	if (mOrganization) CFRelease(mOrganization);
	if (mTitle) CFRelease(mTitle);

	int i;
	if (mEmails) {
		for (i=0;i<mNumEmails;i++) {
			CFRelease(mEmails[i]->mType);
			CFRelease(mEmails[i]->mValue);
		}
		free(mEmails);
	}
	if (mPhones) {
		for (i=0;i<mNumPhones;i++) {
			CFRelease(mPhones[i]->mType);
			CFRelease(mPhones[i]->mValue);
		}
		free(mPhones);
	}
	if (mURLs) {
		for (i=0;i<mNumURLs;i++) {
			CFRelease(mURLs[i]->mType);
			CFRelease(mURLs[i]->mValue);
		}
		free(mURLs);
	}
}

/* string getProperty (in string name); */
NS_IMETHODIMP NativeAddressCard::GetProperty(const char *name, PRUnichar **_retval NS_OUTPARAM)
{
	CFStringRef val = NULL;
	if (!strcmp(name, "firstName")) {
		val = mFirstName;
	} else if (!strcmp(name, "lastName")) {
		val = mLastName;
	} else if (!strcmp(name, "organization")) {
		val = mOrganization;
	} else if (!strcmp(name, "department")) {
		val = mDepartment;
	} else if (!strcmp(name, "jobTitle")) {
		val = mTitle;
	}
	
	if (val) {
    CFIndex length= CFStringGetLength(val);
    CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
    PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
    if (buffer)  {
      CFStringGetCharacters (val, CFRangeMake(0, length), buffer);
      buffer[length] = '\0';
      *_retval = buffer;
      return NS_OK;
    }
    return NS_ERROR_OUT_OF_MEMORY;
	} else {
		// How do we return undefined?
		return NS_OK;
	}
}

// TODO: Replace this with a proper localization strategy.
static const wchar_t *deriveLabelFromString(CFStringRef stringRef)
{
	if (CFStringCompare(stringRef, kABWorkLabel, 0) == 0) {
		return L"work";
	} else if (CFStringCompare(stringRef, kABHomeLabel, 0) == 0) {
		return L"home";
	} else if (CFStringCompare(stringRef, kABOtherLabel, 0) == 0) {
		return L"other";
	} else if (CFStringCompare(stringRef, kABPhoneMobileLabel, 0) == 0) {
		return L"mobile";
	} else if (CFStringCompare(stringRef, kABPhoneHomeFAXLabel, 0) == 0) {
		return L"home fax";
	} else if (CFStringCompare(stringRef, kABPhoneWorkFAXLabel, 0) == 0) {
		return L"work fax";
	} else if (CFStringCompare(stringRef, kABPhonePagerLabel, 0) == 0) {
		return L"pager";
	} else if (CFStringCompare(stringRef, kABPhoneWorkLabel, 0) == 0) {
		return L"work";
	} else if (CFStringCompare(stringRef, kABPhoneHomeLabel, 0) == 0) {
		return L"home";
	} else if (CFStringCompare(stringRef, kABPhoneMainLabel, 0) == 0) {
		return L"main";
	} else {
    return NULL;
	}
}

/* void getPropertyListLabels (in string name, out unsigned long count, [array, retval, size_is (count)] out string labels); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListLabels(const char *name, PRUint32 *count NS_OUTPARAM, PRUnichar ***labels NS_OUTPARAM)
{
	TaggedField **array = NULL;
	int len;
	if (!strcmp(name, "email")) {
		array = mEmails;
		len = mNumEmails;
	}
	else if (!strcmp(name, "phone")) {
		array = mPhones;
		len = mNumPhones;
	}
	else if (!strcmp(name, "urls")) {
		array = mURLs;
		len = mNumURLs;
	}
	
	if (array) {
		*count = len;
		*labels = (PRUnichar **) nsMemory::Alloc(sizeof(PRUnichar*) * len);
		if ( ! (*labels ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
      const wchar_t *labelLocal = deriveLabelFromString(array[i]->mType);
      if (labelLocal) {
        size_t len = wcslen(labelLocal);
        PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(sizeof(PRUnichar) * (len+1));
        if (buffer) {
          memcpy(buffer, labelLocal, sizeof(PRUnichar) * (len+1));
          (*labels)[i] = buffer;
        } else {
          return NS_ERROR_OUT_OF_MEMORY;
        }
      } else {
        CFIndex length= CFStringGetLength(array[i]->mType);
        CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
        PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
        if (buffer) {
          CFStringGetCharacters (array[i]->mType, CFRangeMake(0, length), buffer);
          buffer[length] = '\0';
          (*labels)[i] = buffer;
        } else {
          return NS_ERROR_OUT_OF_MEMORY;
        }
      }
		}
    return NS_OK;
	} else {
		*count = 0;

		// How do we return undefined?
		return NS_OK;
	}
}

/* void getPropertyListValues (in string name, out unsigned long count, [array, retval, size_is (count)] out string values); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListValues(const char *name, PRUint32 *count NS_OUTPARAM, PRUnichar ***values NS_OUTPARAM)
{
	TaggedField **array = NULL;
	int len;
	if (!strcmp(name, "email")) {
		array = mEmails;
		len = mNumEmails;
	}
	else if (!strcmp(name, "phone")) {
		array = mPhones;
		len = mNumPhones;
	}
	else if (!strcmp(name, "urls")) {
		array = mURLs;
		len = mNumURLs;
	}
	
	if (array) {
		*count = len;
		*values = (PRUnichar **) nsMemory::Alloc(sizeof(PRUnichar*) * len);
		if ( ! (*values ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
      CFIndex length= CFStringGetLength(array[i]->mValue);
      CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
      PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
      if (buffer) {
        CFStringGetCharacters (array[i]->mValue, CFRangeMake(0, length), buffer);
        buffer[length] = '\0';
        (*values)[i] = buffer;
      } else {
        return NS_ERROR_OUT_OF_MEMORY;
      }
		}
    return NS_OK;
	} else {
		*count = 0;
		// How do we return undefined?
		return NS_OK;
	}
}


void NativeAddressCard::setFirstName(const CFStringRef name)
{
	mFirstName = name;
}
void NativeAddressCard::setLastName(const CFStringRef name)
{
	mLastName = name;
}
void NativeAddressCard::setOrganization(const CFStringRef org)
{
	mOrganization = org;
}
void NativeAddressCard::setDepartment(const CFStringRef org)
{
	mDepartment = org;
}
void NativeAddressCard::setTitle(const CFStringRef title)
{
  mTitle = title;
}


void NativeAddressCard::setEmail(const CFStringRef type, const CFStringRef email)
{
	if (mNumEmails == mEmailsSize) {
			mEmails = (TaggedField**)realloc(mEmails, sizeof(TaggedField*) * (mEmailsSize + 8));
			mEmailsSize += 8;
	}
	mEmails[mNumEmails++] = new TaggedField(type, email);
}
void NativeAddressCard::setPhone(const CFStringRef type, const CFStringRef phone)
{
	if (mNumPhones == mPhonesSize) {
			mPhones = (TaggedField**)realloc(mPhones, sizeof(TaggedField*) * (mPhonesSize + 8));
			mPhonesSize += 8;
	}
	mPhones[mNumPhones++] = new TaggedField(type, phone);
}
void NativeAddressCard::setURL(const CFStringRef type, const CFStringRef url)
{
	if (mNumURLs == mURLsSize) {
			mURLs = (TaggedField**)realloc(mURLs, sizeof(TaggedField*) * (mURLsSize + 8));
			mURLsSize += 8;
	}
	mURLs[mNumURLs++] = new TaggedField(type, url);
}

TaggedField::TaggedField(const CFStringRef type, const CFStringRef value) : mType(NULL), mValue(NULL)
{
	if (type) mType = type;
	if (value) mValue = value;
}



void NativeAddressCard::setAddress(const CFStringRef type, const CFStringRef streetPtr, const CFStringRef cityPtr, 
                                   const CFStringRef zipPtr, const CFStringRef countryPtr, const CFStringRef countryCodePtr)
{
	if (mNumAddresses == mAddressesSize) {
			mAddresses = (AddressField**)realloc(mAddresses, sizeof(AddressField*) * (mAddressesSize + 8));
			mNumAddresses += 8;
	}
	mAddresses[mNumAddresses++] = new AddressField(type, streetPtr, cityPtr, zipPtr, countryPtr, countryCodePtr);
}

AddressField::AddressField(const CFStringRef type, const CFStringRef street, const CFStringRef city, const CFStringRef zip, 
                           const CFStringRef country, const CFStringRef countryCode) : 
                           mType(NULL), mStreet(NULL), mCity(NULL), mZip(NULL), mCountry(NULL), mCountryCode(NULL)
{
	if (type) mType = type;
	if (street) mStreet = street;
	if (city) mCity = city;
	if (zip) mZip = zip;
	if (country) mCountry = country;
	if (countryCode) mCountryCode = countryCode;
}


