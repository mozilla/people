#include <stdlib.h>
#include <stdio.h>
#include "NativeAddressCard.h"
#include "nsMemory.h"

/* Implementation file */
NS_IMPL_ISUPPORTS1(NativeAddressCard, INativeAddressCard)

NativeAddressCard::NativeAddressCard() 
{
  /* member initializers and constructor code */
	mFirstName = NULL;
	mLastName = NULL;
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
	if (mFirstName) free(mFirstName);
	if (mLastName) free(mLastName);

	int i;
	if (mEmails) {
		for (i=0;i<mNumEmails;i++) {
			free(mEmails[i]->mType);
			free(mEmails[i]->mValue);
		}
		free(mEmails);
	}
	if (mPhones) {
		for (i=0;i<mNumPhones;i++) {
			free(mPhones[i]->mType);
			free(mPhones[i]->mValue);
		}
		free(mPhones);
	}
	if (mURLs) {
		for (i=0;i<mNumURLs;i++) {
			free(mURLs[i]->mType);
			free(mURLs[i]->mValue);
		}
		free(mURLs);
	}
}

/* string getProperty (in string name); */
NS_IMETHODIMP NativeAddressCard::GetProperty(const char *name, char **_retval NS_OUTPARAM)
{
	char *val = NULL;
	if (!strcmp(name, "firstName")) {
		val = mFirstName;
	} else if (!strcmp(name, "lastName")) {
		val = mLastName;
	}
	
	if (val) {
    *_retval = (char*) nsMemory::Clone(val, 
                                       sizeof(char)*(strlen(val)+1));
    return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
	} else {
		// How do we return undefined?
		return NS_OK;
	}
}

/* void getPropertyListLabels (in string name, out unsigned long count, [array, retval, size_is (count)] out string labels); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListLabels(const char *name, PRUint32 *count NS_OUTPARAM, char ***labels NS_OUTPARAM)
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
		*labels = (char **) nsMemory::Alloc(sizeof(char*) * len);
		if ( ! (*labels ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
			(*labels)[i] = (char*) nsMemory::Clone(array[i]->mType, 
																						 sizeof(char) * (strlen(array[i]->mType)+1)
																						 );
			if ( ! ((*labels)[i]) ) return NS_ERROR_OUT_OF_MEMORY;
		}
    return NS_OK;
	} else {
		*count = 0;

		// How do we return undefined?
		return NS_OK;
	}
}

/* void getPropertyListValues (in string name, out unsigned long count, [array, retval, size_is (count)] out string values); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListValues(const char *name, PRUint32 *count NS_OUTPARAM, char ***values NS_OUTPARAM)
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
		*values = (char **) nsMemory::Alloc(sizeof(char*) * len);
		if ( ! (*values ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
/*			char tmp[64];
			snprintf(tmp, 64, "%p-%s", this, array[i]->mValue);
			(*values)[i] = (char*) nsMemory::Clone(tmp,
																						 sizeof(char) * (strlen(tmp)+1)
																						 );
*/
			(*values)[i] = (char*) nsMemory::Clone(array[i]->mValue, 
																						 sizeof(char) * (strlen(array[i]->mValue)+1)
																						 );
			if ( ! ((*values)[i]) ) return NS_ERROR_OUT_OF_MEMORY;
		}
    return NS_OK;
	} else {
		*count = 0;
		// How do we return undefined?
		return NS_OK;
	}
}


void NativeAddressCard::setFirstName(const char *name)
{
	mFirstName = strdup(name);
}
void NativeAddressCard::setLastName(const char *name)
{
	mLastName = strdup(name);
}
void NativeAddressCard::setEmail(const char *type, const char *email)
{
	if (mNumEmails == mEmailsSize) {
			mEmails = (TaggedField**)realloc(mEmails, sizeof(TaggedField*) * (mEmailsSize + 8));
			mEmailsSize += 8;
	}
	mEmails[mNumEmails++] = new TaggedField(type, email);
}
void NativeAddressCard::setPhone(const char *type, const char *phone)
{
	if (mNumPhones == mPhonesSize) {
			mPhones = (TaggedField**)realloc(mPhones, sizeof(TaggedField*) * (mPhonesSize + 8));
			mPhonesSize += 8;
	}
	mPhones[mNumPhones++] = new TaggedField(type, phone);
}
void NativeAddressCard::setURL(const char *type, const char *url)
{
	if (mNumURLs == mURLsSize) {
			mURLs = (TaggedField**)realloc(mURLs, sizeof(TaggedField*) * (mURLsSize + 8));
			mURLsSize += 8;
	}
	mURLs[mNumURLs++] = new TaggedField(type, url);
}


TaggedField::TaggedField(const char *type, const char *value) : mType(NULL), mValue(NULL)
{
	if (type) mType = strdup(type);
	if (value) mValue = strdup(value);
}